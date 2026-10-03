import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CommandIntent,
  CommandReceipt,
  PendingCommand,
} from '../../shared/runtime/contracts';
import { getAuthenticationGeneration } from '../api';
import { inspectCommand, recoverCommandPage, sendCommand } from './commands';
import {
  acknowledgeCommand,
  commandIsTerminal,
  mergeRecoveredCommands,
  prepareTrackedCommand,
  recordCommandReceipt,
  recoverCommands,
  type RecoveredCommand,
} from './command-recovery';
import type { RuntimeConnection } from './use-runtime';

type CommandState = {
  key: string;
  records: RecoveredCommand[];
  busy: boolean;
  error: string;
};

/** Missing receipts pause independently; one uncertain identity cannot starve another run. */
export class ReceiptInspectionSchedule {
  private failures = new Map<string, number>();
  private lastOperationId?: string;

  private eligible(records: RecoveredCommand[]) {
    return records.filter(
      (record) =>
        !commandIsTerminal(record.receipt) &&
        (this.failures.get(record.pending.operationId) ?? 0) < 3,
    );
  }

  hasEligible(records: RecoveredCommand[]) {
    return this.eligible(records).length > 0;
  }

  next(records: RecoveredCommand[]) {
    const candidates = this.eligible(records);
    if (!candidates.length) return undefined;
    const previous = candidates.findIndex(
      (record) => record.pending.operationId === this.lastOperationId,
    );
    const next = candidates[(previous + 1) % candidates.length];
    this.lastOperationId = next.pending.operationId;
    return next;
  }

  observe(operationId: string, receipt?: CommandReceipt) {
    this.failures.set(
      operationId,
      !receipt || receipt.status === 'outcome_unknown'
        ? (this.failures.get(operationId) ?? 0) + 1
        : 0,
    );
  }
}

export function useCommands(
  conversationId: string,
  connection: RuntimeConnection,
) {
  const scope = connection.setup?.scope;
  const key = JSON.stringify([scope, conversationId]);
  const activeKey = useRef(key);
  activeKey.current = key;
  const generation = useRef(0);
  const working = useRef(false);
  const [state, setState] = useState<CommandState>({
    key,
    records: [],
    busy: false,
    error: '',
  });
  const [refresh, setRefresh] = useState(0);
  const [recovery, setRecovery] = useState<{
    key: string;
    cursor: string | null;
  }>({ key, cursor: null });
  const inspect = useCallback(
    async (pending: PendingCommand) => {
      if (!scope || working.current || activeKey.current !== key) return;
      const current = generation.current;
      const auth = getAuthenticationGeneration();
      working.current = true;
      setState((previous) => ({ ...previous, busy: true, error: '' }));
      try {
        const raw = await inspectCommand(pending);
        if (
          current !== generation.current ||
          activeKey.current !== key ||
          auth !== getAuthenticationGeneration()
        )
          return;
        recordCommandReceipt(pending, raw);
        setState({
          key,
          records: recoverCommands(scope, conversationId),
          busy: true,
          error:
            raw.status === 'outcome_unknown'
              ? raw.reason ||
                'Original outcome is still unknown. No command was resent.'
              : '',
        });
        return raw;
      } catch (cause) {
        if (current === generation.current && activeKey.current === key)
          setState((previous) => ({
            ...previous,
            error:
              cause instanceof Error
                ? cause.message
                : 'Inspection unavailable. No command was resent.',
          }));
      } finally {
        if (current === generation.current) {
          working.current = false;
          setState((previous) => ({ ...previous, busy: false }));
        }
      }
    },
    [key, conversationId],
  );
  useEffect(() => {
    generation.current++;
    working.current = false;
    try {
      setState({
        key,
        records: scope ? recoverCommands(scope, conversationId) : [],
        busy: false,
        error: '',
      });
    } catch {
      setState({
        key,
        records: [],
        busy: false,
        error:
          'Saved command recovery is unavailable. Do not resend uncertain work blindly.',
      });
    }
    return () => {
      generation.current++;
      working.current = false;
    };
  }, [key, conversationId]);
  const recover = useCallback(
    async (cursor?: string) => {
      if (!scope || working.current || activeKey.current !== key) return;
      const current = generation.current;
      const auth = getAuthenticationGeneration();
      const valid = () =>
        current === generation.current &&
        activeKey.current === key &&
        auth === getAuthenticationGeneration();
      working.current = true;
      setState((previous) => ({ ...previous, busy: true, error: '' }));
      let nextCursor = cursor;
      const seen = new Set<string>();
      try {
        for (let pages = 0; pages < 3; pages++) {
          if (nextCursor) seen.add(nextCursor);
          const page = await recoverCommandPage(
            scope,
            conversationId,
            nextCursor,
          );
          if (!valid()) return;
          if (page.nextCursor && seen.has(page.nextCursor))
            throw new Error('Command recovery cursor did not advance.');
          const records = mergeRecoveredCommands(
            scope,
            conversationId,
            page.commands,
          );
          setState({ key, records, busy: true, error: '' });
          setRecovery({ key, cursor: page.nextCursor });
          if (!page.nextCursor) break;
          nextCursor = page.nextCursor;
        }
        setRefresh((value) => value + 1);
      } catch (cause) {
        if (valid())
          setState((previous) => ({
            ...previous,
            error:
              cause instanceof Error
                ? cause.message
                : 'Server command recovery is unavailable. No work was resent.',
          }));
      } finally {
        if (valid()) {
          working.current = false;
          setState((previous) => ({ ...previous, busy: false }));
        }
      }
    },
    [key, conversationId],
  );
  useEffect(() => {
    void recover();
  }, [recover]);
  const current =
    state.key === key ? state : { key, records: [], busy: false, error: '' };
  const records = useRef(current.records);
  records.current = current.records;
  // Read-only lifecycle recovery, one request at a time, bounded per refresh.
  // Unknown commands are also inspectable, but no path here ever submits them.
  useEffect(() => {
    if (!scope) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = new ReceiptInspectionSchedule();
    const poll = async () => {
      if (active && !working.current && !document.hidden) {
        const candidate = schedule.next(records.current);
        if (candidate) {
          const receipt = await inspect(candidate.pending);
          schedule.observe(candidate.pending.operationId, receipt);
        }
      }
      if (!active) return;
      if (schedule.hasEligible(records.current))
        timer = setTimeout(() => void poll(), 2500);
      else if (
        records.current.some((record) => !commandIsTerminal(record.receipt))
      )
        setState((previous) => ({
          ...previous,
          error:
            'Automatic receipt inspection paused after repeated unavailable outcomes. Use Inspect or Refresh saved state to try again; no command was resent.',
        }));
    };
    timer = setTimeout(() => void poll(), 2500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, refresh, inspect]);
  const submit = async (
    intent: CommandIntent,
  ): Promise<CommandReceipt | undefined> => {
    if (!scope || working.current || intent.conversationId !== conversationId)
      return;
    const currentGeneration = generation.current;
    const auth = getAuthenticationGeneration();
    const valid = () =>
      currentGeneration === generation.current &&
      activeKey.current === key &&
      auth === getAuthenticationGeneration();
    working.current = true;
    setState((previous) => ({ ...previous, busy: true, error: '' }));
    let pending: PendingCommand | undefined;
    try {
      const prepared = await prepareTrackedCommand(scope, intent);
      pending = prepared.pending;
      if (!valid()) return;
      setState({
        key,
        records: recoverCommands(scope, conversationId),
        busy: true,
        error: '',
      });
      const raw = await (prepared.existing
        ? inspectCommand(pending)
        : sendCommand(pending));
      if (!valid()) return;
      const receipt = recordCommandReceipt(pending, raw);
      setState({
        key,
        records: recoverCommands(scope, conversationId),
        busy: true,
        error:
          receipt.status === 'outcome_unknown' || receipt.status === 'rejected'
            ? receipt.reason
            : '',
      });
      setRefresh((value) => value + 1);
      return receipt;
    } catch (cause) {
      if (!valid()) return;
      setState((previous) => ({
        ...previous,
        error: pending
          ? 'Admission could not be confirmed. The draft and immutable operation ID are retained. Inspect this operation before sending it again.'
          : cause instanceof Error
            ? cause.message
            : 'The request could not be safely stored. No command was sent.',
      }));
    } finally {
      if (valid()) {
        working.current = false;
        setState((previous) => ({ ...previous, busy: false }));
      }
    }
  };
  return {
    ...current,
    submit,
    inspect,
    recoveryCursor: recovery.key === key ? recovery.cursor : null,
    refreshRecovery: () => recover(),
    recoverMore: () =>
      recovery.key === key && recovery.cursor
        ? recover(recovery.cursor)
        : Promise.resolve(),
    acknowledge: (receipt: CommandReceipt) => {
      if (!scope || activeKey.current !== key) return;
      const record = recoverCommands(scope, conversationId).find(
        (item) => item.pending.operationId === receipt.operationId,
      );
      if (record) acknowledgeCommand(record.pending);
    },
    resumeInspection: () => setRefresh((value) => value + 1),
  };
}
