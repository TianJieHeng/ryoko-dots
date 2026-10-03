import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { sameScope, type RuntimeScope } from '../shared/runtime/contracts';
import {
  canStartRealtime,
  voiceCallSchema,
  type RuntimeVoiceProfile,
} from '../shared/runtime/voice';
import {
  admitVoice,
  voiceCompute,
  pendingVoiceAdmission,
  inspectVoiceAdmission,
  clearVoiceAdmission,
} from './runtime/voice-client';
import { runtimeAction } from './runtime/actions';
export function useVoice(
  threadId: string,
  onSaved: () => void,
  anchorMessageId?: string,
  profile?: RuntimeVoiceProfile,
  scope?: RuntimeScope,
) {
  const [status, setStatus] = useState<
    'idle' | 'connecting' | 'active' | 'ending'
  >('idle');
  const generation = useRef(0);
  const [recoveryCall, setRecoveryCall] = useState<string>();
  const context = useRef({ profile, scope });
  context.current = { profile, scope };
  const connecting = useRef(false);
  const ending = useRef(false);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [startedAt, setStartedAt] = useState<number>();
  const [phase, setPhase] = useState<'listening' | 'speaking' | 'thinking'>(
    'listening',
  );
  const [caption, setCaption] = useState('');
  const [userCaption, setUserCaption] = useState('');
  const session = useRef<
    | {
        pc: RTCPeerConnection;
        stream: MediaStream;
        audio: HTMLAudioElement;
        id?: string;
        scope: RuntimeScope;
        channel: RTCDataChannel;
        transcript: string[];
        timer?: ReturnType<typeof setTimeout>;
        cancelled: boolean;
      }
    | undefined
  >(undefined);
  const anchor = useRef(anchorMessageId);
  anchor.current = anchorMessageId;
  const closeMedia = useCallback(() => {
    const current = session.current;
    if (!current) return;
    current.cancelled = true;
    current.stream.getTracks().forEach((track) => track.stop());
    current.channel.close();
    current.pc.close();
    current.audio.pause();
    current.audio.srcObject = null;
    clearTimeout(current.timer);
  }, []);
  const end = useCallback(async () => {
    if (ending.current) return;
    generation.current++;
    connecting.current = false;
    const current = session.current;
    if (!current) {
      setStatus('idle');
      return;
    }
    // Stop local capture immediately. Remote hangup and mission lifetime are independent.
    current.cancelled = true;
    current.stream.getTracks().forEach((track) => {
      track.enabled = false;
    });
    current.audio.pause();
    clearTimeout(current.timer);
    closeMedia();
    ending.current = true;
    setStatus('ending');
    try {
      if (current.id)
        await runtimeAction(
          current.scope,
          `/runtime/voice/calls/${encodeURIComponent(current.id)}/control`,
          'end_media',
          {
            transcript: current.transcript.join('\n').slice(0, 20000),
            anchorMessageId: anchor.current ?? null,
            cancelMission: false,
          },
          0,
        );
      onSaved();
    } catch (e) {
      if (current.id) setRecoveryCall(current.id);
      setError(
        e instanceof Error
          ? e.message
          : 'Local audio stopped; server hangup is unconfirmed. Accepted work continues.',
      );
    } finally {
      closeMedia();
      session.current = undefined;
      ending.current = false;
      setStatus('idle');
    }
  }, [closeMedia, onSaved]);
  useEffect(
    () => () => {
      generation.current++;
      const current = session.current;
      closeMedia();
      // Teardown releases local microphone/audio only. It never cancels work or
      // blindly posts a second hangup. The backend expires detached media leases.
      if (current?.id) {
        try {
          sessionStorage.setItem(
            `ryoko-detached-call:${current.id}`,
            JSON.stringify({ id: current.id, scope: current.scope }),
          );
        } catch {
          /* Server-owned lease/receipt remains the recovery authority. */
        }
      }
    },
    [closeMedia],
  );
  useEffect(() => {
    if (status !== 'active' && status !== 'connecting') return;
    const timer = setInterval(() => {
      const current = session.current;
      const id = current?.id;
      if (id)
        void api<unknown>(`/runtime/voice/calls/${encodeURIComponent(id)}`)
          .then((raw) => {
            const call = voiceCallSchema.parse(raw);
            if (!sameScope(call.scope, current.scope) || call.id !== id)
              throw new Error('Call receipt scope changed.');
            if (session.current === current && call.endedAt) {
              closeMedia();
              session.current = undefined;
              setStatus('idle');
              onSaved();
            }
          })
          .catch(() => {
            if (session.current !== current) return;
            setError(
              'Call control connection was lost. Microphone and audio are stopped; accepted work continues.',
            );
            closeMedia();
            setRecoveryCall(id);
            session.current = undefined;
            setStatus('idle');
          });
    }, 2000);
    return () => clearInterval(timer);
  }, [status, closeMedia, onSaved, end]);
  const start = async () => {
    if (session.current || connecting.current || ending.current) return;
    if (!profile || !scope || !canStartRealtime(profile, scope)) {
      setError(
        'A qualified realtime media adapter is required. Finite local speech is a different interaction mode.',
      );
      return;
    }
    if (pendingVoiceAdmission(scope, threadId)) {
      setError(
        'A previous media request has an unknown outcome. Inspect it before starting another call.',
      );
      return;
    }
    connecting.current = true;
    const attempt = ++generation.current;
    setStatus('connecting');
    setError('');
    setMuted(false);
    setSpeakerMuted(false);
    setStartedAt(undefined);
    setPhase('listening');
    setCaption('');
    setUserCaption('');
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attempt !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const pc = new RTCPeerConnection();
      const audio = new Audio();
      audio.autoplay = true;
      const channel = pc.createDataChannel('oai-events');
      const current = {
        pc,
        scope,
        audio,
        stream,
        channel,
        transcript: [] as string[],
        cancelled: false,
        id: undefined as string | undefined,
        timer: undefined as ReturnType<typeof setTimeout> | undefined,
      };
      session.current = current;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream!));
      pc.ontrack = (event) => {
        if (current.cancelled) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio.play().catch(() => {
          if (!current.cancelled)
            setError(
              'Audio playback was blocked. Check your browser audio permissions.',
            );
        });
      };
      pc.onconnectionstatechange = () => {
        if (current.cancelled) return;
        if (pc.connectionState === 'connected') {
          setStatus('active');
          setStartedAt((value) => value ?? Date.now());
          if (current.id)
            void runtimeAction(
              current.scope,
              `/runtime/voice/calls/${encodeURIComponent(current.id)}/control`,
              'media_connected',
              {},
              0,
            ).catch((e) => {
              if (!current.cancelled) setError(e.message);
            });
        }
        if (['failed', 'disconnected'].includes(pc.connectionState)) {
          setError('The voice connection dropped.');
          void end();
        }
      };
      channel.onmessage = async (event) => {
        if (current.cancelled) return;
        let data: Record<string, unknown>;
        try {
          const raw = String(event.data);
          if (raw.length > 256000)
            throw new Error('Media event exceeds safe size.');
          const parsed: unknown = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object') return;
          data = parsed as Record<string, unknown>;
        } catch {
          return;
        }
        if (data.type === 'input_audio_buffer.speech_started') {
          setPhase('listening');
          setCaption('');
        }
        if (
          data.type === 'response.output_audio_transcript.delta' &&
          typeof data.delta === 'string'
        ) {
          setPhase('speaking');
          setCaption((text) => (text + data.delta).slice(-20000));
        }
        if (data.type === 'output_audio_buffer.stopped') setPhase('listening');
        if (data.type === 'response.created') {
          setCaption('');
          setPhase('thinking');
        }
        if (typeof data.transcript === 'string') {
          if (current.transcript.length >= 1000)
            current.transcript.splice(0, 100);
          data.transcript = data.transcript.slice(-20000);
          if (
            data.type ===
            'conversation.item.input_audio_transcription.completed'
          ) {
            current.transcript.push(`You: ${data.transcript}`);
            setUserCaption(data.transcript.slice(-20000));
          }
          if (data.type === 'response.output_audio_transcript.done')
            current.transcript.push(`Dot: ${data.transcript}`);
        }
        if (data.type === 'error')
          setError(
            'The voice provider reported a session error. End the call and retry.',
          );
        if (
          data.type !== 'response.function_call_arguments.done' ||
          data.name !== 'ask_compute' ||
          typeof data.call_id !== 'string' ||
          !current.id
        )
          return;
        let output: string;
        setPhase('thinking');
        try {
          const args: unknown = JSON.parse(String(data.arguments));
          if (
            !args ||
            typeof args !== 'object' ||
            !('request' in args) ||
            typeof args.request !== 'string'
          )
            throw new Error('Invalid compute request.');
          if (!context.current.profile?.computeAllowed)
            throw new Error('Voice compute is not available for this adapter.');
          const result = await voiceCompute(
            current.scope,
            current.id,
            data.call_id,
            args.request,
          );
          output =
            result.status === 'completed' && result.text !== null
              ? result.text
              : result.status === 'accepted'
                ? 'The work was durably accepted. Inspect its mission for the final result.'
                : 'The compute outcome is not confirmed. Inspect the original request; do not repeat it.';
        } catch (e) {
          output = `Compute outcome unknown: ${e instanceof Error ? e.message : 'Inspect the original request'}`;
        }
        if (!current.cancelled && channel.readyState === 'open') {
          channel.send(
            JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: data.call_id,
                output,
              },
            }),
          );
          channel.send(JSON.stringify({ type: 'response.create' }));
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await admitVoice(
        scope,
        threadId,
        offer.sdp ?? '',
        anchor.current,
      );
      current.id = response.callId;
      if (current.cancelled) {
        await runtimeAction(
          current.scope,
          `/runtime/voice/calls/${encodeURIComponent(response.callId)}/control`,
          'end_media',
          { cancelMission: false, discardedCapture: true },
          0,
        );
        return;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: response.sdp! });
      if (current.cancelled) return;
      current.timer = setTimeout(
        () => void end(),
        Math.max(
          0,
          Math.min(
            profile.maxCallSeconds * 1000,
            response.expiresAt - Date.now(),
          ),
        ),
      );
    } catch (e) {
      if (attempt !== generation.current) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      const current = session.current;
      const id = current?.id;
      if (id)
        void runtimeAction(
          current!.scope,
          `/runtime/voice/calls/${encodeURIComponent(id)}/control`,
          'end_media',
          { cancelMission: false, discardedCapture: true },
          0,
        ).catch(() => setRecoveryCall(id));
      stream?.getTracks().forEach((track) => track.stop());
      closeMedia();
      session.current = undefined;
      setStatus('idle');
      setError(e instanceof Error ? e.message : 'Could not connect the call.');
    } finally {
      if (attempt === generation.current) connecting.current = false;
    }
  };
  useEffect(() => {
    const current = session.current;
    if (current && !sameScope(current.scope, scope ?? null)) {
      generation.current++;
      closeMedia();
      session.current = undefined;
      setStatus('idle');
    }
  }, [JSON.stringify(scope), closeMedia]);
  const inspect = async () => {
    if (!scope) return;
    try {
      const receipt = await inspectVoiceAdmission(scope, threadId);
      if (receipt?.status === 'admitted') setRecoveryCall(receipt.callId);
      setError(
        receipt
          ? `Media request ${receipt.status}; accepted work is independent.`
          : 'No pending media admission.',
      );
    } catch {
      setError('Media admission remains unknown. No new call was started.');
    }
  };
  const endRecovered = async () => {
    if (!scope || !recoveryCall) return;
    try {
      await runtimeAction(
        scope,
        `/runtime/voice/calls/${encodeURIComponent(recoveryCall)}/control`,
        'end_media',
        { cancelMission: false, discardedCapture: true },
        0,
      );
      const call = voiceCallSchema.parse(
        await api(`/runtime/voice/calls/${encodeURIComponent(recoveryCall)}`),
      );
      if (!sameScope(scope, call.scope) || !call.endedAt) throw new Error();
      clearVoiceAdmission(scope, threadId);
      setRecoveryCall(undefined);
      setError('Recovered media hangup confirmed. Accepted missions continue.');
    } catch {
      setError(
        'Hangup is not confirmed yet. Inspect again; no new media session was started.',
      );
    }
  };
  const toggleMute = () => {
    const next = !muted;
    session.current?.stream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  };
  const toggleSpeaker = () => {
    const next = !speakerMuted;
    if (session.current) session.current.audio.muted = next;
    setSpeakerMuted(next);
  };
  return {
    status,
    error,
    inspect,
    endRecovered,
    recoveryCall,
    start,
    end,
    muted,
    speakerMuted,
    startedAt,
    phase,
    caption,
    userCaption,
    toggleMute,
    toggleSpeaker,
  };
}
