# Reviewed normalized history export v1

This is the Dots inert migration format, not a claim about Intelligence's export API. The operator must supply original authorized export bytes and review normalization coverage. Tool calls, approvals and receipts are inert historical text/evidence only. The importer has no runtime client.

```json
{
  "version": 1,
  "kind": "dots-inert-history-v1",
  "ownerId": "pinned-owner",
  "sourceNamespace": "stable-legacy-installation",
  "sourceSystem": "intelligence",
  "sourceExportSha256": "sha256-of-the-original-authorized-export-file",
  "sourceDeclaredComplete": false,
  "conversationCount": 1,
  "messageCount": 2,
  "conversations": [
    {
      "legacyId": "original-thread-id",
      "title": "Historical conversation",
      "createdAt": 1700000000000,
      "messages": [
        {
          "legacyId": "original-message-1",
          "role": "user",
          "text": "Historical question",
          "createdAt": 1700000000001
        },
        {
          "legacyId": "original-message-2",
          "role": "assistant",
          "text": "Historical answer",
          "createdAt": 1700000000002
        }
      ]
    }
  ]
}
```

Top-level/conversation/message fields are exact; unknown fields such as `approved`, `execute`, `toolCalls`, `authorization` or runtime scope are rejected, not interpreted. Preserve original IDs and timestamps; document source timestamp units (the normalizer must use Unix milliseconds). Never manufacture missing messages or claim complete when the export was partial. Missing ID/timestamp evidence blocks this v1 normalizer rather than inventing data. Valid roles: user, assistant, system, tool, unknown. Non-display roles remain inert in the protected archive and are omitted by the default reader with an exact count. Original bytes remain separately available for review, covered by their digest.

Conversation IDs: `legacy_` plus SHA-256 of canonical JSON `[sourceNamespace, "history-conversation", [legacyId]]`. Message IDs likewise hash `[sourceNamespace, "history-message", [conversationLegacyId, messageLegacyId]]`. An updated export does not change IDs. Immutable first content wins; new bytes under an old identity produce quarantine, not edit or replay.

Supply a reviewed envelope per bounded export chunk if necessary. Namespace remains stable across chunks. Imports do not prove the provider export was exhaustive; `sourceDeclaredComplete` is a declaration preserved in the receipt, never independently certified. `fullMigrationComplete` stays false until all inventory dispositions and BE12 qualification gates are resolved.

The archive's `history_conversations`, `history_messages`, `history_imports`, `history_quarantine` and `history_tombstones` are independent of production command/approval/scheduler tables. Reader integration must be authenticated under the same owner, use the owner-pinned read-only helper contract, keep original ID links and label source/provenance. No browser-supplied path, SQLite query, owner identifier, trusted scope or executable template is allowed.
