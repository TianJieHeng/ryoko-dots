// GENERATED exact subset of pinned producer. DO NOT EDIT.
// Regenerate: node scripts/pin-producer-contract.mjs /path/to/ryoko-agent
export const producerSchema = {
  "methods": [
    {
      "name": "client.capabilities",
      "summary": "What the calling client handles, sent once per connection (after gateway.ready); returns the server→client request methods this backend may send.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/ClientCapabilitiesParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/ClientCapabilitiesResult"
        }
      }
    },
    {
      "name": "runtime.approval.get",
      "summary": "Read one exact owner/session approval and retained review bytes plus durable decision. Never resolve, consume or dispatch on recovery.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeApprovalGetParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeApprovalGetResult"
        }
      }
    },
    {
      "name": "runtime.approval.resolve",
      "summary": "Record one exact human decision for the owned live run. Repeated answers are rejected; this never dispatches.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeApprovalResolveParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeApprovalResolveResult"
        }
      }
    },
    {
      "name": "runtime.approvals.list",
      "summary": "Read an owned oldest-first bounded approval snapshot. This is not complete history or permission to act.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeApprovalListParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeApprovalListResult"
        }
      }
    },
    {
      "name": "runtime.capabilities",
      "summary": "Negotiate the owned session's durable runtime API and executable operations.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeCapabilitiesParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeCapabilities"
        }
      }
    },
    {
      "name": "runtime.command",
      "summary": "Accept one idempotent command. Retries return the original durable receipt.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeCommandParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/CommandReceipt"
        }
      }
    },
    {
      "name": "runtime.command.receipt",
      "summary": "Read an owned command's original receipt and recorded status without submitting or recovering execution.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeCommandReceiptParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeCommandReceiptResult"
        }
      }
    },
    {
      "name": "runtime.control.get",
      "summary": "Read owner/profile pause state and an optional immutable operation receipt; never replay a control.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeControlGetParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeControlResult"
        }
      }
    },
    {
      "name": "runtime.control.pause",
      "summary": "CAS and idempotently set owner/profile admission and dispatch state. Existing work retains ownership; no rollback or provider stop is implied.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeControlParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeControlResult"
        }
      }
    },
    {
      "name": "runtime.control.resume",
      "summary": "CAS and idempotently set owner/profile admission and dispatch state. Existing work retains ownership; no rollback or provider stop is implied.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeControlParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeControlResult"
        }
      }
    },
    {
      "name": "runtime.conversation.archive",
      "summary": "Idempotent metadata-revision-checked archive/restore; does not cancel running work.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeConversationArchiveParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeConversationResult"
        }
      }
    },
    {
      "name": "runtime.conversation.bind",
      "summary": "Authorize before initializing/reusing a live session; poll readiness without resubmitting commands.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeConversationRefParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeConversationBindResult"
        }
      }
    },
    {
      "name": "runtime.conversation.capabilities",
      "summary": "Discover the owner-scoped API. Only the server-owned launch-profile stdio pipe is supported.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeConversationParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeConversationCapabilities"
        }
      }
    },
    {
      "name": "runtime.conversation.command.receipt",
      "summary": "Read an owned canonical conversation's durable command receipt and bounded message links without binding a live session or constructing a provider. Never requeue or claim work.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeConversationCommandReceiptParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeCommandReceiptResult"
        }
      }
    },
    {
      "name": "runtime.conversation.create",
      "summary": "Atomically persist a canonical conversation and an owner-scoped durable idempotency receipt.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeConversationCreateParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeConversationCreateResult"
        }
      }
    },
    {
      "name": "runtime.conversation.export",
      "summary": "Same paged safe transcript as history; concatenate text chunks by message_id and text_offset. Not a runtime backup or import format.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeConversationHistoryParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeConversationHistoryResult"
        }
      }
    },
    {
      "name": "runtime.conversation.history",
      "summary": "Committed human/assistant text only, stable message IDs, compression lineage, bounded text chunks. Append watermark, not immutable edit snapshot.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeConversationHistoryParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeConversationHistoryResult"
        }
      }
    },
    {
      "name": "runtime.conversation.list",
      "summary": "Bounded owner-only title search/list, ordered by stable creation key.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeConversationListParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeConversationListResult"
        }
      }
    },
    {
      "name": "runtime.conversation.operation.get",
      "summary": "Read the original owner-scoped operation receipt or found=false. Never create, rename, archive, bind or queue work.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeConversationOperationParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeConversationOperationResult"
        }
      }
    },
    {
      "name": "runtime.conversation.rename",
      "summary": "Idempotent metadata-revision-checked rename; a retry returns the original mutation receipt.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeConversationRenameParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeConversationResult"
        }
      }
    },
    {
      "name": "runtime.delivery.ack",
      "summary": "Record exact attempt/digest-bound client component receipt, not human read confirmation.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeDeliveryAckParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeDeliveryReceipt"
        }
      }
    },
    {
      "name": "runtime.delivery.retry",
      "summary": "Explicitly retry only a result notification on the owned local transport; never rerun inference.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeDeliveryParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeDeliveryReceipt"
        }
      }
    },
    {
      "name": "runtime.delivery.status",
      "summary": "Read delivery truth without creating a delivery attempt.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeDeliveryParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeDeliveryReceipt"
        }
      }
    },
    {
      "name": "runtime.dots.effect.reconcile",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/DotsReconcileParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/DotsEffectResult"
        }
      }
    },
    {
      "name": "runtime.dots.page.prepare",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/DotsPagePrepareParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/DotsPreparedResult"
        }
      }
    },
    {
      "name": "runtime.dots.page.publish",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/DotsPagePublishParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/DotsEffectResult"
        }
      }
    },
    {
      "name": "runtime.dots.register",
      "summary": "Register the owned current stdio peer's native adapter; does not provision credentials or replay effects.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/DotsRegistrationParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/DotsRegistrationResult"
        }
      }
    },
    {
      "name": "runtime.effect.get",
      "summary": "Inspect one owned effect and its bounded receipt metadata without exposing private input or paths.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeEffectParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeEffectGetResult"
        }
      }
    },
    {
      "name": "runtime.effects.list",
      "summary": "Read an owned oldest-first bounded effect snapshot, never a claim of complete history.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeEffectListParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeEffectListResult"
        }
      }
    },
    {
      "name": "runtime.events.since",
      "summary": "Read bounded durable transitions, or an explicit snapshot_required with a consistent snapshot.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeEventsSinceParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeEventsSinceResult"
        }
      }
    },
    {
      "name": "runtime.mission.cancel",
      "summary": "Apply an explicit owned mission control with exact revision and existing budget scope.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MissionControlParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MissionResult"
        }
      }
    },
    {
      "name": "runtime.mission.get",
      "summary": "Read the owned authoritative mission independently from runtime command state.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MissionGetParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MissionGetResult"
        }
      }
    },
    {
      "name": "runtime.mission.history",
      "summary": "Read current and immutable archived missions for this canonical conversation. Controls always target the active exact mission.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MissionListParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MissionListResult"
        }
      }
    },
    {
      "name": "runtime.mission.pause",
      "summary": "Apply an explicit owned mission control with exact revision and existing budget scope.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MissionControlParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MissionResult"
        }
      }
    },
    {
      "name": "runtime.mission.resume",
      "summary": "Apply an explicit owned mission control with exact revision and existing budget scope.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MissionControlParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MissionResult"
        }
      }
    },
    {
      "name": "runtime.project.get",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeProjectParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeProjectResult"
        }
      }
    },
    {
      "name": "runtime.result.get",
      "summary": "Read bounded digest-checked immutable result bytes without executing or delivering work.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeResultGetParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/RuntimeResultChunk"
        }
      }
    },
    {
      "name": "runtime.snapshot",
      "summary": "Read a consistent durable mission projection and its restart-stable cursor.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeSessionParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MissionSnapshot"
        }
      }
    }
  ],
  "serverRequests": [
    {
      "name": "dots.approval",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/DotsApprovalRequest"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/DotsApprovalResult"
        }
      }
    },
    {
      "name": "dots.effect.dispatch",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/DotsDispatchRequest"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/DotsEffectReceipt"
        }
      }
    },
    {
      "name": "dots.effect.inspect",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/DotsInspectRequest"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/DotsEffectReceipt"
        }
      }
    },
    {
      "name": "dots.page.read",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/DotsPageReadRequest"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/DotsPageReadResult"
        }
      }
    }
  ],
  "notifications": [
    {
      "name": "request.cancel",
      "summary": "The backend withdrew an open server→client request; clear the matching card only.",
      "params": [
        {
          "name": "payload",
          "schema": {
            "$ref": "#/components/schemas/RequestCancelPayload"
          }
        }
      ]
    }
  ],
  "components": {
    "schemas": {
      "ClientCapabilitiesParams": {
        "additionalProperties": false,
        "properties": {
          "server_requests": {
            "default": false,
            "title": "Server Requests",
            "type": "boolean"
          },
          "dots_native": {
            "default": false,
            "title": "Dots Native",
            "type": "boolean"
          }
        },
        "title": "ClientCapabilitiesParams",
        "type": "object"
      },
      "ClientCapabilitiesResult": {
        "additionalProperties": false,
        "properties": {
          "server_requests": {
            "items": {
              "type": "string"
            },
            "title": "Server Requests",
            "type": "array"
          },
          "declines_not_shown": {
            "default": false,
            "title": "Declines Not Shown",
            "type": "boolean"
          }
        },
        "required": [
          "server_requests"
        ],
        "title": "ClientCapabilitiesResult",
        "type": "object"
      },
      "RuntimeApprovalGetParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "approval_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Approval Id",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "approval_id"
        ],
        "title": "RuntimeApprovalGetParams",
        "type": "object"
      },
      "RuntimeApprovalGetResult": {
        "additionalProperties": false,
        "properties": {
          "approval": {
            "$ref": "#/components/schemas/RuntimeApprovalRecord"
          },
          "detail": {
            "$ref": "#/components/schemas/RuntimeApprovalDetail"
          },
          "decision": {
            "$ref": "#/components/schemas/RuntimeApprovalDecision"
          },
          "input_revision": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Input Revision"
          },
          "artifact_revision": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Artifact Revision"
          },
          "dispatch_performed": {
            "const": false,
            "title": "Dispatch Performed",
            "type": "boolean"
          }
        },
        "required": [
          "approval",
          "detail",
          "decision",
          "input_revision",
          "artifact_revision",
          "dispatch_performed"
        ],
        "title": "RuntimeApprovalGetResult",
        "type": "object"
      },
      "RuntimeApprovalRecord": {
        "additionalProperties": false,
        "properties": {
          "approval_id": {
            "title": "Approval Id",
            "type": "string"
          },
          "run_id": {
            "title": "Run Id",
            "type": "string"
          },
          "approval_digest": {
            "title": "Approval Digest",
            "type": "string"
          },
          "action_digest": {
            "title": "Action Digest",
            "type": "string"
          },
          "input_digest": {
            "title": "Input Digest",
            "type": "string"
          },
          "target_digest": {
            "title": "Target Digest",
            "type": "string"
          },
          "input_revision_digest": {
            "title": "Input Revision Digest",
            "type": "string"
          },
          "artifact_revision_digest": {
            "title": "Artifact Revision Digest",
            "type": "string"
          },
          "policy_version": {
            "title": "Policy Version",
            "type": "string"
          },
          "policy_digest": {
            "title": "Policy Digest",
            "type": "string"
          },
          "status": {
            "enum": [
              "pending",
              "approved",
              "denied",
              "consumed",
              "invalidated"
            ],
            "title": "Status",
            "type": "string"
          },
          "expires_at": {
            "title": "Expires At",
            "type": "number"
          },
          "expired": {
            "title": "Expired",
            "type": "boolean"
          },
          "created_at": {
            "title": "Created At",
            "type": "number"
          },
          "resolved_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Resolved At"
          },
          "consumed_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Consumed At"
          },
          "invalidation_reason": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Invalidation Reason"
          },
          "mission_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Mission Id"
          },
          "mission_revision": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Mission Revision"
          },
          "invalidated_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Invalidated At"
          }
        },
        "required": [
          "approval_id",
          "run_id",
          "approval_digest",
          "action_digest",
          "input_digest",
          "target_digest",
          "input_revision_digest",
          "artifact_revision_digest",
          "policy_version",
          "policy_digest",
          "status",
          "expires_at",
          "expired",
          "created_at",
          "resolved_at",
          "consumed_at"
        ],
        "title": "RuntimeApprovalRecord",
        "type": "object"
      },
      "RuntimeApprovalDetail": {
        "additionalProperties": false,
        "properties": {
          "reviewable": {
            "title": "Reviewable",
            "type": "boolean"
          },
          "unavailable_reason": {
            "anyOf": [
              {
                "enum": [
                  "review_not_retained",
                  "opaque_content",
                  "sensitive_content",
                  "content_not_retained",
                  "review_size_limit"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Unavailable Reason"
          },
          "review": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeApprovalExactReview"
              },
              {
                "type": "null"
              }
            ]
          },
          "review_digest": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Review Digest"
          }
        },
        "required": [
          "reviewable",
          "unavailable_reason",
          "review",
          "review_digest"
        ],
        "title": "RuntimeApprovalDetail",
        "type": "object"
      },
      "RuntimeApprovalExactReview": {
        "additionalProperties": false,
        "properties": {
          "action": {
            "$ref": "#/components/schemas/RuntimeApprovalReviewAction"
          },
          "content": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeApprovalReviewContent"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "action",
          "content"
        ],
        "title": "RuntimeApprovalExactReview",
        "type": "object"
      },
      "RuntimeApprovalReviewAction": {
        "additionalProperties": false,
        "properties": {
          "name": {
            "title": "Name",
            "type": "string"
          },
          "arguments": {
            "additionalProperties": true,
            "title": "Arguments",
            "type": "object"
          },
          "operation_class": {
            "title": "Operation Class",
            "type": "string"
          },
          "resource_roots": {
            "items": {
              "type": "string"
            },
            "title": "Resource Roots",
            "type": "array"
          },
          "destination": {
            "title": "Destination",
            "type": "string"
          },
          "destination_purpose": {
            "title": "Destination Purpose",
            "type": "string"
          },
          "contract_digest": {
            "title": "Contract Digest",
            "type": "string"
          }
        },
        "required": [
          "name",
          "arguments",
          "operation_class",
          "resource_roots",
          "destination",
          "destination_purpose",
          "contract_digest"
        ],
        "title": "RuntimeApprovalReviewAction",
        "type": "object"
      },
      "RuntimeApprovalReviewContent": {
        "additionalProperties": false,
        "properties": {
          "encoding": {
            "const": "base64",
            "title": "Encoding",
            "type": "string"
          },
          "data": {
            "title": "Data",
            "type": "string"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "mime": {
            "title": "Mime",
            "type": "string"
          }
        },
        "required": [
          "encoding",
          "data",
          "sha256",
          "mime"
        ],
        "title": "RuntimeApprovalReviewContent",
        "type": "object"
      },
      "RuntimeApprovalDecision": {
        "additionalProperties": false,
        "properties": {
          "choice": {
            "anyOf": [
              {
                "enum": [
                  "once",
                  "deny"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Choice"
          },
          "resolved_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Resolved At"
          },
          "consumed_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Consumed At"
          }
        },
        "required": [
          "choice",
          "resolved_at",
          "consumed_at"
        ],
        "title": "RuntimeApprovalDecision",
        "type": "object"
      },
      "RuntimeApprovalResolveParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "approval_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Approval Id",
            "type": "string"
          },
          "approval_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Approval Digest",
            "type": "string"
          },
          "choice": {
            "enum": [
              "once",
              "deny"
            ],
            "title": "Choice",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "approval_id",
          "approval_digest",
          "choice"
        ],
        "title": "RuntimeApprovalResolveParams",
        "type": "object"
      },
      "RuntimeApprovalResolveResult": {
        "additionalProperties": false,
        "properties": {
          "approval": {
            "$ref": "#/components/schemas/RuntimeApprovalRecord"
          },
          "dispatch_performed": {
            "const": false,
            "title": "Dispatch Performed",
            "type": "boolean"
          }
        },
        "required": [
          "approval",
          "dispatch_performed"
        ],
        "title": "RuntimeApprovalResolveResult",
        "type": "object"
      },
      "RuntimeApprovalListParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "run_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Run Id"
          },
          "limit": {
            "default": 100,
            "maximum": 200,
            "minimum": 1,
            "title": "Limit",
            "type": "integer"
          }
        },
        "required": [
          "session_id",
          "schema_version"
        ],
        "title": "RuntimeApprovalListParams",
        "type": "object"
      },
      "RuntimeApprovalListResult": {
        "additionalProperties": false,
        "properties": {
          "approvals": {
            "items": {
              "$ref": "#/components/schemas/RuntimeApprovalRecord"
            },
            "title": "Approvals",
            "type": "array"
          },
          "limit": {
            "title": "Limit",
            "type": "integer"
          },
          "truncated": {
            "title": "Truncated",
            "type": "boolean"
          },
          "complete": {
            "const": false,
            "title": "Complete",
            "type": "boolean"
          }
        },
        "required": [
          "approvals",
          "limit",
          "truncated",
          "complete"
        ],
        "title": "RuntimeApprovalListResult",
        "type": "object"
      },
      "RuntimeCapabilitiesParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          }
        },
        "required": [
          "session_id"
        ],
        "title": "RuntimeCapabilitiesParams",
        "type": "object"
      },
      "RuntimeCapabilities": {
        "additionalProperties": false,
        "properties": {
          "schema_versions": {
            "items": {
              "const": 1,
              "type": "integer"
            },
            "title": "Schema Versions",
            "type": "array"
          },
          "operations": {
            "items": {
              "$ref": "#/components/schemas/RuntimeOperationCapability"
            },
            "title": "Operations",
            "type": "array"
          },
          "strict_identity_required": {
            "title": "Strict Identity Required",
            "type": "boolean"
          },
          "durable_replay": {
            "title": "Durable Replay",
            "type": "boolean"
          },
          "max_events": {
            "title": "Max Events",
            "type": "integer"
          },
          "admission": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeAdmissionLimits"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "provider": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeProviderCapabilities"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "tool_view": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeToolView"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "cursor_policy": {
            "const": "snapshot_required_on_expired_or_unknown_cursor",
            "title": "Cursor Policy",
            "type": "string"
          }
        },
        "required": [
          "schema_versions",
          "operations",
          "strict_identity_required",
          "durable_replay",
          "max_events",
          "cursor_policy"
        ],
        "title": "RuntimeCapabilities",
        "type": "object"
      },
      "RuntimeOperationCapability": {
        "additionalProperties": false,
        "properties": {
          "operation": {
            "enum": [
              "submit",
              "steer",
              "cancel",
              "approval"
            ],
            "title": "Operation",
            "type": "string"
          },
          "accepts_commands": {
            "title": "Accepts Commands",
            "type": "boolean"
          },
          "executes": {
            "title": "Executes",
            "type": "boolean"
          },
          "effects_enabled": {
            "title": "Effects Enabled",
            "type": "boolean"
          },
          "reason": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Reason"
          }
        },
        "required": [
          "operation",
          "accepts_commands",
          "executes",
          "effects_enabled"
        ],
        "title": "RuntimeOperationCapability",
        "type": "object"
      },
      "RuntimeAdmissionLimits": {
        "additionalProperties": false,
        "properties": {
          "scope": {
            "const": "profile_store",
            "default": "profile_store",
            "title": "Scope",
            "type": "string"
          },
          "max_active": {
            "title": "Max Active",
            "type": "integer"
          },
          "max_queued": {
            "title": "Max Queued",
            "type": "integer"
          },
          "max_per_principal": {
            "title": "Max Per Principal",
            "type": "integer"
          },
          "max_payload_bytes": {
            "title": "Max Payload Bytes",
            "type": "integer"
          },
          "max_queue_bytes": {
            "title": "Max Queue Bytes",
            "type": "integer"
          },
          "max_database_bytes": {
            "title": "Max Database Bytes",
            "type": "integer"
          },
          "ttl_seconds": {
            "title": "Ttl Seconds",
            "type": "number"
          },
          "interactive_boost_seconds": {
            "title": "Interactive Boost Seconds",
            "type": "number"
          },
          "launch_lease_seconds": {
            "title": "Launch Lease Seconds",
            "type": "number"
          }
        },
        "required": [
          "max_active",
          "max_queued",
          "max_per_principal",
          "max_payload_bytes",
          "max_queue_bytes",
          "max_database_bytes",
          "ttl_seconds",
          "interactive_boost_seconds",
          "launch_lease_seconds"
        ],
        "title": "RuntimeAdmissionLimits",
        "type": "object"
      },
      "RuntimeProviderCapabilities": {
        "additionalProperties": false,
        "description": "Adapter declarations; model support and live cancellation remain separate.",
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "api_mode": {
            "title": "Api Mode",
            "type": "string"
          },
          "adapter": {
            "title": "Adapter",
            "type": "string"
          },
          "declaration_scope": {
            "const": "adapter",
            "title": "Declaration Scope",
            "type": "string"
          },
          "streaming": {
            "enum": [
              "supported",
              "unsupported",
              "unknown"
            ],
            "title": "Streaming",
            "type": "string"
          },
          "parallel_tools": {
            "enum": [
              "supported",
              "unsupported",
              "unknown"
            ],
            "title": "Parallel Tools",
            "type": "string"
          },
          "media_inputs": {
            "items": {
              "type": "string"
            },
            "title": "Media Inputs",
            "type": "array"
          },
          "model_capabilities": {
            "const": "unverified",
            "title": "Model Capabilities",
            "type": "string"
          },
          "usage": {
            "enum": [
              "final_response",
              "provider_reported",
              "unknown"
            ],
            "title": "Usage",
            "type": "string"
          },
          "cancellation": {
            "enum": [
              "local_only",
              "provider_acknowledgment",
              "unknown"
            ],
            "title": "Cancellation",
            "type": "string"
          },
          "cache_semantics": {
            "title": "Cache Semantics",
            "type": "string"
          },
          "opaque_state_version": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Opaque State Version"
          },
          "execution_owner": {
            "enum": [
              "hermes",
              "provider",
              "unknown"
            ],
            "title": "Execution Owner",
            "type": "string"
          },
          "durable_execution": {
            "title": "Durable Execution",
            "type": "boolean"
          },
          "bounded_budget": {
            "enum": [
              "conditional_openai_text",
              "unsupported"
            ],
            "title": "Bounded Budget",
            "type": "string"
          }
        },
        "required": [
          "schema_version",
          "api_mode",
          "adapter",
          "declaration_scope",
          "streaming",
          "parallel_tools",
          "media_inputs",
          "model_capabilities",
          "usage",
          "cancellation",
          "cache_semantics",
          "opaque_state_version",
          "execution_owner",
          "durable_execution",
          "bounded_budget"
        ],
        "title": "RuntimeProviderCapabilities",
        "type": "object"
      },
      "RuntimeToolView": {
        "additionalProperties": false,
        "description": "Frozen authorized metadata only; inspection cannot refresh the prompt.",
        "properties": {
          "catalog_version": {
            "title": "Catalog Version",
            "type": "string"
          },
          "session_policy_version": {
            "title": "Session Policy Version",
            "type": "string"
          },
          "installed_tool_ids": {
            "items": {
              "type": "string"
            },
            "title": "Installed Tool Ids",
            "type": "array"
          },
          "authorized_tool_ids": {
            "items": {
              "type": "string"
            },
            "title": "Authorized Tool Ids",
            "type": "array"
          },
          "discoverable_tool_ids": {
            "items": {
              "type": "string"
            },
            "title": "Discoverable Tool Ids",
            "type": "array"
          },
          "selected_tool_ids": {
            "items": {
              "type": "string"
            },
            "title": "Selected Tool Ids",
            "type": "array"
          },
          "unavailable_reasons": {
            "additionalProperties": {
              "type": "string"
            },
            "title": "Unavailable Reasons",
            "type": "object"
          }
        },
        "required": [
          "catalog_version",
          "session_policy_version",
          "installed_tool_ids",
          "authorized_tool_ids",
          "discoverable_tool_ids",
          "selected_tool_ids",
          "unavailable_reasons"
        ],
        "title": "RuntimeToolView",
        "type": "object"
      },
      "RuntimeCommandParams": {
        "additionalProperties": false,
        "description": "Operation selects the payload: text for submit/steer, reason for cancel,\napproval_id/decision for approval. Accepted is a durable receipt, not proof\nof execution; consult capabilities and replay for execution status.\ntarget_run_id pins cancel/steer to one run; omission preserves legacy controls.",
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "idempotency_key": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Idempotency Key",
            "type": "string"
          },
          "expected_revision": {
            "anyOf": [
              {
                "minimum": 0,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Expected Revision"
          },
          "operation": {
            "enum": [
              "submit",
              "steer",
              "cancel",
              "approval"
            ],
            "title": "Operation",
            "type": "string"
          },
          "target_run_id": {
            "default": null,
            "maxLength": 256,
            "minLength": 1,
            "title": "Target Run Id",
            "type": "string"
          },
          "payload": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeTextPayload"
              },
              {
                "$ref": "#/components/schemas/RuntimeCancelPayload"
              },
              {
                "$ref": "#/components/schemas/RuntimeApprovalPayload"
              }
            ],
            "title": "Payload"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "command_id",
          "idempotency_key",
          "expected_revision",
          "operation",
          "payload"
        ],
        "title": "RuntimeCommandParams",
        "type": "object"
      },
      "RuntimeTextPayload": {
        "additionalProperties": false,
        "properties": {
          "text": {
            "maxLength": 65536,
            "minLength": 1,
            "title": "Text",
            "type": "string"
          }
        },
        "required": [
          "text"
        ],
        "title": "RuntimeTextPayload",
        "type": "object"
      },
      "RuntimeCancelPayload": {
        "additionalProperties": false,
        "properties": {
          "reason": {
            "default": "",
            "maxLength": 1024,
            "title": "Reason",
            "type": "string"
          }
        },
        "title": "RuntimeCancelPayload",
        "type": "object"
      },
      "RuntimeApprovalPayload": {
        "additionalProperties": false,
        "properties": {
          "approval_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Approval Id",
            "type": "string"
          },
          "decision": {
            "enum": [
              "approve",
              "deny"
            ],
            "title": "Decision",
            "type": "string"
          }
        },
        "required": [
          "approval_id",
          "decision"
        ],
        "title": "RuntimeApprovalPayload",
        "type": "object"
      },
      "CommandReceipt": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "command_id": {
            "title": "Command Id",
            "type": "string"
          },
          "status": {
            "enum": [
              "accepted",
              "rejected",
              "duplicate"
            ],
            "title": "Status",
            "type": "string"
          },
          "durable_revision": {
            "title": "Durable Revision",
            "type": "integer"
          },
          "run_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Run Id"
          },
          "conflict": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeConflict"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          }
        },
        "required": [
          "schema_version",
          "command_id",
          "status",
          "durable_revision",
          "run_id"
        ],
        "title": "CommandReceipt",
        "type": "object"
      },
      "RuntimeConflict": {
        "additionalProperties": false,
        "properties": {
          "code": {
            "title": "Code",
            "type": "string"
          },
          "message": {
            "title": "Message",
            "type": "string"
          }
        },
        "required": [
          "code",
          "message"
        ],
        "title": "RuntimeConflict",
        "type": "object"
      },
      "RuntimeCommandReceiptParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "message_limit": {
            "default": 100,
            "maximum": 100,
            "minimum": 1,
            "title": "Message Limit",
            "type": "integer"
          },
          "message_cursor": {
            "anyOf": [
              {
                "maxLength": 2048,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Message Cursor"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "command_id"
        ],
        "title": "RuntimeCommandReceiptParams",
        "type": "object"
      },
      "RuntimeCommandReceiptResult": {
        "additionalProperties": false,
        "description": "Read-only recovery of an original receipt and its latest recorded state.",
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "command_id": {
            "title": "Command Id",
            "type": "string"
          },
          "found": {
            "title": "Found",
            "type": "boolean"
          },
          "receipt": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/CommandReceipt"
              },
              {
                "type": "null"
              }
            ]
          },
          "status": {
            "anyOf": [
              {
                "enum": [
                  "accepted",
                  "claimed",
                  "completed",
                  "failed",
                  "blocked",
                  "cancelled"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Status"
          },
          "durable_revision": {
            "title": "Durable Revision",
            "type": "integer"
          },
          "accepted_input": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeAcceptedInput"
              },
              {
                "type": "null"
              }
            ]
          },
          "messages": {
            "items": {
              "$ref": "#/components/schemas/RuntimeCommandMessage"
            },
            "title": "Messages",
            "type": "array"
          },
          "messages_has_more": {
            "title": "Messages Has More",
            "type": "boolean"
          },
          "next_message_cursor": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Next Message Cursor"
          }
        },
        "required": [
          "schema_version",
          "command_id",
          "found",
          "receipt",
          "status",
          "durable_revision",
          "accepted_input",
          "messages",
          "messages_has_more",
          "next_message_cursor"
        ],
        "title": "RuntimeCommandReceiptResult",
        "type": "object"
      },
      "RuntimeAcceptedInput": {
        "additionalProperties": false,
        "properties": {
          "state": {
            "enum": [
              "accepted",
              "committed"
            ],
            "title": "State",
            "type": "string"
          },
          "message_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Message Id"
          }
        },
        "required": [
          "state",
          "message_id"
        ],
        "title": "RuntimeAcceptedInput",
        "type": "object"
      },
      "RuntimeCommandMessage": {
        "additionalProperties": false,
        "properties": {
          "message_id": {
            "title": "Message Id",
            "type": "string"
          },
          "role": {
            "enum": [
              "user",
              "assistant",
              "tool"
            ],
            "title": "Role",
            "type": "string"
          },
          "kind": {
            "enum": [
              "input",
              "output"
            ],
            "title": "Kind",
            "type": "string"
          },
          "committed": {
            "const": true,
            "title": "Committed",
            "type": "boolean"
          }
        },
        "required": [
          "message_id",
          "role",
          "kind",
          "committed"
        ],
        "title": "RuntimeCommandMessage",
        "type": "object"
      },
      "RuntimeControlGetParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "operation_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Operation Id"
          }
        },
        "required": [
          "session_id",
          "schema_version"
        ],
        "title": "RuntimeControlGetParams",
        "type": "object"
      },
      "RuntimeControlResult": {
        "additionalProperties": false,
        "properties": {
          "control": {
            "$ref": "#/components/schemas/RuntimeControlState"
          },
          "operation": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeControlOperation"
              },
              {
                "type": "null"
              }
            ]
          },
          "dispatch_performed": {
            "const": false,
            "title": "Dispatch Performed",
            "type": "boolean"
          }
        },
        "required": [
          "control",
          "operation",
          "dispatch_performed"
        ],
        "title": "RuntimeControlResult",
        "type": "object"
      },
      "RuntimeControlState": {
        "additionalProperties": false,
        "properties": {
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "paused": {
            "title": "Paused",
            "type": "boolean"
          },
          "updated_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Updated At"
          },
          "scope": {
            "const": "owner_profile",
            "title": "Scope",
            "type": "string"
          },
          "admission_blocked": {
            "title": "Admission Blocked",
            "type": "boolean"
          },
          "scheduled_dispatch_blocked": {
            "title": "Scheduled Dispatch Blocked",
            "type": "boolean"
          },
          "in_flight_dispatch": {
            "enum": [
              "blocked_at_next_boundary",
              "allowed_at_checked_boundary"
            ],
            "title": "In Flight Dispatch",
            "type": "string"
          },
          "accepted_commands": {
            "title": "Accepted Commands",
            "type": "integer"
          },
          "claimed_commands": {
            "title": "Claimed Commands",
            "type": "integer"
          },
          "accepted_work_retained": {
            "const": true,
            "title": "Accepted Work Retained",
            "type": "boolean"
          },
          "already_dispatched_may_complete": {
            "const": true,
            "title": "Already Dispatched May Complete",
            "type": "boolean"
          },
          "provider_cancelled": {
            "const": false,
            "title": "Provider Cancelled",
            "type": "boolean"
          },
          "remote_effects_undone": {
            "const": false,
            "title": "Remote Effects Undone",
            "type": "boolean"
          }
        },
        "required": [
          "revision",
          "paused",
          "updated_at",
          "scope",
          "admission_blocked",
          "scheduled_dispatch_blocked",
          "in_flight_dispatch",
          "accepted_commands",
          "claimed_commands",
          "accepted_work_retained",
          "already_dispatched_may_complete",
          "provider_cancelled",
          "remote_effects_undone"
        ],
        "title": "RuntimeControlState",
        "type": "object"
      },
      "RuntimeControlOperation": {
        "additionalProperties": false,
        "properties": {
          "operation_id": {
            "title": "Operation Id",
            "type": "string"
          },
          "digest": {
            "title": "Digest",
            "type": "string"
          },
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "paused": {
            "title": "Paused",
            "type": "boolean"
          },
          "committed_at": {
            "title": "Committed At",
            "type": "number"
          },
          "status": {
            "const": "committed",
            "title": "Status",
            "type": "string"
          }
        },
        "required": [
          "operation_id",
          "digest",
          "revision",
          "paused",
          "committed_at",
          "status"
        ],
        "title": "RuntimeControlOperation",
        "type": "object"
      },
      "RuntimeControlParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "operation_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Operation Id",
            "type": "string"
          },
          "expected_revision": {
            "minimum": 0,
            "title": "Expected Revision",
            "type": "integer"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "operation_id",
          "expected_revision"
        ],
        "title": "RuntimeControlParams",
        "type": "object"
      },
      "RuntimeConversationArchiveParams": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "conversation_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Conversation Id",
            "type": "string"
          },
          "idempotency_key": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Idempotency Key",
            "type": "string"
          },
          "expected_revision": {
            "minimum": 1,
            "title": "Expected Revision",
            "type": "integer"
          },
          "archived": {
            "title": "Archived",
            "type": "boolean"
          }
        },
        "required": [
          "schema_version",
          "conversation_id",
          "idempotency_key",
          "expected_revision",
          "archived"
        ],
        "title": "RuntimeConversationArchiveParams",
        "type": "object"
      },
      "RuntimeConversationResult": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "conversation": {
            "$ref": "#/components/schemas/RuntimeConversation"
          }
        },
        "required": [
          "schema_version",
          "conversation"
        ],
        "title": "RuntimeConversationResult",
        "type": "object"
      },
      "RuntimeConversation": {
        "additionalProperties": false,
        "properties": {
          "conversation_id": {
            "title": "Conversation Id",
            "type": "string"
          },
          "agent_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Agent Id",
            "type": "string"
          },
          "title": {
            "title": "Title",
            "type": "string"
          },
          "archived": {
            "title": "Archived",
            "type": "boolean"
          },
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "created_at": {
            "title": "Created At",
            "type": "number"
          },
          "updated_at": {
            "title": "Updated At",
            "type": "number"
          },
          "source": {
            "const": "web",
            "title": "Source",
            "type": "string"
          }
        },
        "required": [
          "conversation_id",
          "agent_id",
          "title",
          "archived",
          "revision",
          "created_at",
          "updated_at",
          "source"
        ],
        "title": "RuntimeConversation",
        "type": "object"
      },
      "RuntimeConversationRefParams": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "conversation_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Conversation Id",
            "type": "string"
          }
        },
        "required": [
          "schema_version",
          "conversation_id"
        ],
        "title": "RuntimeConversationRefParams",
        "type": "object"
      },
      "RuntimeConversationBindResult": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "conversation": {
            "$ref": "#/components/schemas/RuntimeConversation"
          },
          "session_id": {
            "title": "Session Id",
            "type": "string"
          },
          "readiness": {
            "enum": [
              "building",
              "ready",
              "failed"
            ],
            "title": "Readiness",
            "type": "string"
          },
          "failure_code": {
            "anyOf": [
              {
                "enum": [
                  "agent_build_failed",
                  "identity_mismatch"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Failure Code"
          }
        },
        "required": [
          "schema_version",
          "conversation",
          "session_id",
          "readiness",
          "failure_code"
        ],
        "title": "RuntimeConversationBindResult",
        "type": "object"
      },
      "RuntimeConversationParams": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          }
        },
        "required": [
          "schema_version"
        ],
        "title": "RuntimeConversationParams",
        "type": "object"
      },
      "RuntimeConversationCapabilities": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "authority": {
            "const": "trusted_stdio_owner",
            "title": "Authority",
            "type": "string"
          },
          "owner_scope": {
            "const": "principal_profile_agent_home",
            "title": "Owner Scope",
            "type": "string"
          },
          "identity": {
            "$ref": "#/components/schemas/RuntimeConversationIdentity"
          },
          "methods": {
            "items": {
              "type": "string"
            },
            "title": "Methods",
            "type": "array"
          },
          "max_page": {
            "title": "Max Page",
            "type": "integer"
          },
          "max_text_chunk_chars": {
            "title": "Max Text Chunk Chars",
            "type": "integer"
          },
          "max_page_text_bytes": {
            "title": "Max Page Text Bytes",
            "type": "integer"
          },
          "transcript_format": {
            "const": "safe_transcript_v1",
            "title": "Transcript Format",
            "type": "string"
          },
          "command_message_linkage": {
            "const": "explicit",
            "title": "Command Message Linkage",
            "type": "string"
          },
          "restore_supported": {
            "const": false,
            "title": "Restore Supported",
            "type": "boolean"
          }
        },
        "required": [
          "schema_version",
          "authority",
          "owner_scope",
          "identity",
          "methods",
          "max_page",
          "max_text_chunk_chars",
          "max_page_text_bytes",
          "transcript_format",
          "command_message_linkage",
          "restore_supported"
        ],
        "title": "RuntimeConversationCapabilities",
        "type": "object"
      },
      "RuntimeConversationIdentity": {
        "additionalProperties": false,
        "properties": {
          "principal_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Principal Id",
            "type": "string"
          },
          "profile_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Profile Id",
            "type": "string"
          },
          "agent_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Agent Id",
            "type": "string"
          },
          "policy_digest": {
            "title": "Policy Digest",
            "type": "string"
          },
          "config_digest": {
            "title": "Config Digest",
            "type": "string"
          },
          "role": {
            "enum": [
              "primary",
              "specialist"
            ],
            "title": "Role",
            "type": "string"
          },
          "memory_backend": {
            "enum": [
              "personal_mcp",
              "builtin"
            ],
            "title": "Memory Backend",
            "type": "string"
          }
        },
        "required": [
          "principal_id",
          "profile_id",
          "agent_id",
          "policy_digest",
          "config_digest",
          "role",
          "memory_backend"
        ],
        "title": "RuntimeConversationIdentity",
        "type": "object"
      },
      "RuntimeConversationCommandReceiptParams": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "conversation_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Conversation Id",
            "type": "string"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "message_limit": {
            "default": 100,
            "maximum": 100,
            "minimum": 1,
            "title": "Message Limit",
            "type": "integer"
          },
          "message_cursor": {
            "anyOf": [
              {
                "maxLength": 2048,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Message Cursor"
          }
        },
        "required": [
          "schema_version",
          "conversation_id",
          "command_id"
        ],
        "title": "RuntimeConversationCommandReceiptParams",
        "type": "object"
      },
      "RuntimeConversationCreateParams": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "agent_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Agent Id"
          },
          "idempotency_key": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Idempotency Key",
            "type": "string"
          },
          "title": {
            "default": "",
            "maxLength": 200,
            "title": "Title",
            "type": "string"
          }
        },
        "required": [
          "schema_version",
          "idempotency_key"
        ],
        "title": "RuntimeConversationCreateParams",
        "type": "object"
      },
      "RuntimeConversationCreateResult": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "conversation": {
            "$ref": "#/components/schemas/RuntimeConversation"
          },
          "created": {
            "title": "Created",
            "type": "boolean"
          }
        },
        "required": [
          "schema_version",
          "conversation",
          "created"
        ],
        "title": "RuntimeConversationCreateResult",
        "type": "object"
      },
      "RuntimeConversationHistoryParams": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "conversation_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Conversation Id",
            "type": "string"
          },
          "limit": {
            "default": 50,
            "maximum": 100,
            "minimum": 1,
            "title": "Limit",
            "type": "integer"
          },
          "cursor": {
            "anyOf": [
              {
                "maxLength": 2048,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Cursor"
          }
        },
        "required": [
          "schema_version",
          "conversation_id"
        ],
        "title": "RuntimeConversationHistoryParams",
        "type": "object"
      },
      "RuntimeConversationHistoryResult": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "conversation_id": {
            "title": "Conversation Id",
            "type": "string"
          },
          "format": {
            "const": "safe_transcript_v1",
            "title": "Format",
            "type": "string"
          },
          "messages": {
            "items": {
              "$ref": "#/components/schemas/RuntimeConversationTextChunk"
            },
            "title": "Messages",
            "type": "array"
          },
          "lineage": {
            "items": {
              "type": "string"
            },
            "title": "Lineage",
            "type": "array"
          },
          "snapshot_max_row_id": {
            "title": "Snapshot Max Row Id",
            "type": "integer"
          },
          "next_cursor": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Next Cursor"
          },
          "has_more": {
            "title": "Has More",
            "type": "boolean"
          }
        },
        "required": [
          "schema_version",
          "conversation_id",
          "format",
          "messages",
          "lineage",
          "snapshot_max_row_id",
          "next_cursor",
          "has_more"
        ],
        "title": "RuntimeConversationHistoryResult",
        "type": "object"
      },
      "RuntimeConversationTextChunk": {
        "additionalProperties": false,
        "properties": {
          "message_id": {
            "title": "Message Id",
            "type": "string"
          },
          "physical_session_id": {
            "title": "Physical Session Id",
            "type": "string"
          },
          "role": {
            "enum": [
              "user",
              "assistant"
            ],
            "title": "Role",
            "type": "string"
          },
          "text": {
            "title": "Text",
            "type": "string"
          },
          "text_offset": {
            "description": "UTF-8 byte offset in the original safe text before control-character sanitization",
            "title": "Text Offset",
            "type": "integer"
          },
          "next_text_offset": {
            "description": "Exclusive UTF-8 source byte end offset before control-character sanitization",
            "title": "Next Text Offset",
            "type": "integer"
          },
          "text_complete": {
            "title": "Text Complete",
            "type": "boolean"
          },
          "text_sanitized": {
            "title": "Text Sanitized",
            "type": "boolean"
          },
          "non_text_omitted": {
            "title": "Non Text Omitted",
            "type": "boolean"
          },
          "timestamp": {
            "title": "Timestamp",
            "type": "number"
          },
          "committed": {
            "const": true,
            "title": "Committed",
            "type": "boolean"
          },
          "command_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Command Id"
          }
        },
        "required": [
          "message_id",
          "physical_session_id",
          "role",
          "text",
          "text_offset",
          "next_text_offset",
          "text_complete",
          "text_sanitized",
          "non_text_omitted",
          "timestamp",
          "committed",
          "command_id"
        ],
        "title": "RuntimeConversationTextChunk",
        "type": "object"
      },
      "RuntimeConversationListParams": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "agent_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Agent Id"
          },
          "limit": {
            "default": 50,
            "maximum": 100,
            "minimum": 1,
            "title": "Limit",
            "type": "integer"
          },
          "cursor": {
            "anyOf": [
              {
                "maxLength": 2048,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Cursor"
          },
          "archived": {
            "default": false,
            "title": "Archived",
            "type": "boolean"
          },
          "query": {
            "default": "",
            "maxLength": 200,
            "title": "Query",
            "type": "string"
          }
        },
        "required": [
          "schema_version"
        ],
        "title": "RuntimeConversationListParams",
        "type": "object"
      },
      "RuntimeConversationListResult": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "conversations": {
            "items": {
              "$ref": "#/components/schemas/RuntimeConversation"
            },
            "title": "Conversations",
            "type": "array"
          },
          "next_cursor": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Next Cursor"
          },
          "has_more": {
            "title": "Has More",
            "type": "boolean"
          }
        },
        "required": [
          "schema_version",
          "conversations",
          "next_cursor",
          "has_more"
        ],
        "title": "RuntimeConversationListResult",
        "type": "object"
      },
      "RuntimeConversationOperationParams": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "agent_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Agent Id"
          },
          "idempotency_key": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Idempotency Key",
            "type": "string"
          }
        },
        "required": [
          "schema_version",
          "idempotency_key"
        ],
        "title": "RuntimeConversationOperationParams",
        "type": "object"
      },
      "RuntimeConversationOperationResult": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "found": {
            "title": "Found",
            "type": "boolean"
          },
          "idempotency_key": {
            "title": "Idempotency Key",
            "type": "string"
          },
          "operation": {
            "anyOf": [
              {
                "enum": [
                  "create",
                  "rename",
                  "archive"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Operation"
          },
          "conversation": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeConversation"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "schema_version",
          "found",
          "idempotency_key",
          "operation",
          "conversation"
        ],
        "title": "RuntimeConversationOperationResult",
        "type": "object"
      },
      "RuntimeConversationRenameParams": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "conversation_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Conversation Id",
            "type": "string"
          },
          "idempotency_key": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Idempotency Key",
            "type": "string"
          },
          "expected_revision": {
            "minimum": 1,
            "title": "Expected Revision",
            "type": "integer"
          },
          "title": {
            "maxLength": 200,
            "minLength": 1,
            "title": "Title",
            "type": "string"
          }
        },
        "required": [
          "schema_version",
          "conversation_id",
          "idempotency_key",
          "expected_revision",
          "title"
        ],
        "title": "RuntimeConversationRenameParams",
        "type": "object"
      },
      "RuntimeDeliveryAckParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "delivery_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Delivery Id",
            "type": "string"
          },
          "attempt_token": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Attempt Token",
            "type": "string"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "text_received": {
            "default": false,
            "title": "Text Received",
            "type": "boolean"
          },
          "artifact_received": {
            "default": false,
            "title": "Artifact Received",
            "type": "boolean"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "delivery_id",
          "attempt_token",
          "sha256"
        ],
        "title": "RuntimeDeliveryAckParams",
        "type": "object"
      },
      "RuntimeDeliveryReceipt": {
        "additionalProperties": false,
        "properties": {
          "delivery_id": {
            "title": "Delivery Id",
            "type": "string"
          },
          "artifact_id": {
            "title": "Artifact Id",
            "type": "string"
          },
          "version": {
            "title": "Version",
            "type": "integer"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "destination": {
            "$ref": "#/components/schemas/RuntimeDeliveryDestination"
          },
          "state": {
            "enum": [
              "pending",
              "attempting",
              "awaiting_ack",
              "partial",
              "delivered",
              "failed",
              "outcome_unknown",
              "dead_letter"
            ],
            "title": "State",
            "type": "string"
          },
          "acknowledgment_level": {
            "enum": [
              "none",
              "transport_accepted",
              "client_received"
            ],
            "title": "Acknowledgment Level",
            "type": "string"
          },
          "components": {
            "$ref": "#/components/schemas/RuntimeDeliveryComponents"
          },
          "platform_ids": {
            "items": {
              "type": "string"
            },
            "title": "Platform Ids",
            "type": "array"
          },
          "attempt_count": {
            "title": "Attempt Count",
            "type": "integer"
          },
          "max_attempts": {
            "title": "Max Attempts",
            "type": "integer"
          },
          "next_attempt_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Next Attempt At"
          },
          "deadline_at": {
            "title": "Deadline At",
            "type": "number"
          },
          "retention_until": {
            "title": "Retention Until",
            "type": "number"
          },
          "last_error": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Last Error"
          },
          "result_available": {
            "title": "Result Available",
            "type": "boolean"
          }
        },
        "required": [
          "delivery_id",
          "artifact_id",
          "version",
          "sha256",
          "destination",
          "state",
          "acknowledgment_level",
          "components",
          "platform_ids",
          "attempt_count",
          "max_attempts",
          "next_attempt_at",
          "deadline_at",
          "retention_until",
          "last_error",
          "result_available"
        ],
        "title": "RuntimeDeliveryReceipt",
        "type": "object"
      },
      "RuntimeDeliveryDestination": {
        "additionalProperties": false,
        "properties": {
          "kind": {
            "const": "local_runtime",
            "title": "Kind",
            "type": "string"
          },
          "session_id": {
            "title": "Session Id",
            "type": "string"
          },
          "principal_id": {
            "title": "Principal Id",
            "type": "string"
          },
          "profile_id": {
            "title": "Profile Id",
            "type": "string"
          },
          "agent_id": {
            "title": "Agent Id",
            "type": "string"
          }
        },
        "required": [
          "kind",
          "session_id",
          "principal_id",
          "profile_id",
          "agent_id"
        ],
        "title": "RuntimeDeliveryDestination",
        "type": "object"
      },
      "RuntimeDeliveryComponents": {
        "additionalProperties": false,
        "properties": {
          "text": {
            "enum": [
              "not_sent",
              "client_received"
            ],
            "title": "Text",
            "type": "string"
          },
          "artifact": {
            "enum": [
              "not_sent",
              "client_received"
            ],
            "title": "Artifact",
            "type": "string"
          }
        },
        "required": [
          "text",
          "artifact"
        ],
        "title": "RuntimeDeliveryComponents",
        "type": "object"
      },
      "RuntimeDeliveryParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "delivery_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Delivery Id",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "delivery_id"
        ],
        "title": "RuntimeDeliveryParams",
        "type": "object"
      },
      "DotsReconcileParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "effect_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Effect Id",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "effect_id"
        ],
        "title": "DotsReconcileParams",
        "type": "object"
      },
      "DotsEffectResult": {
        "additionalProperties": false,
        "properties": {
          "effect_id": {
            "title": "Effect Id",
            "type": "string"
          },
          "operation_id": {
            "title": "Operation Id",
            "type": "string"
          },
          "state": {
            "enum": [
              "prepared",
              "dispatched",
              "confirmed",
              "failed",
              "outcome_unknown",
              "reconciliation_required"
            ],
            "title": "State",
            "type": "string"
          },
          "receipt": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/DotsEffectReceipt"
              },
              {
                "type": "null"
              }
            ]
          },
          "replay_permitted": {
            "const": false,
            "default": false,
            "title": "Replay Permitted",
            "type": "boolean"
          }
        },
        "required": [
          "effect_id",
          "operation_id",
          "state",
          "receipt"
        ],
        "title": "DotsEffectResult",
        "type": "object"
      },
      "DotsEffectReceipt": {
        "additionalProperties": false,
        "properties": {
          "identity": {
            "$ref": "#/components/schemas/DotsEffectIdentity"
          },
          "state": {
            "enum": [
              "committed",
              "not_applied",
              "outcome_unknown"
            ],
            "title": "State",
            "type": "string"
          },
          "receipt_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Receipt Id"
          },
          "content_sha256": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Content Sha256"
          },
          "version": {
            "anyOf": [
              {
                "minimum": 0,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Version"
          },
          "result_sha256": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Result Sha256"
          },
          "reason": {
            "enum": [
              "committed",
              "conflict",
              "grant_revoked",
              "takeover",
              "stale_snapshot",
              "unavailable",
              "unknown"
            ],
            "title": "Reason",
            "type": "string"
          }
        },
        "required": [
          "identity",
          "state",
          "reason"
        ],
        "title": "DotsEffectReceipt",
        "type": "object"
      },
      "DotsEffectIdentity": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "default": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "principal_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Principal Id",
            "type": "string"
          },
          "profile_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Profile Id",
            "type": "string"
          },
          "agent_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Agent Id",
            "type": "string"
          },
          "runtime_session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Runtime Session Id",
            "type": "string"
          },
          "run_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Run Id",
            "type": "string"
          },
          "operation_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Operation Id",
            "type": "string"
          },
          "effect_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Effect Id",
            "type": "string"
          },
          "approval_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Approval Id",
            "type": "string"
          },
          "approval_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Approval Digest",
            "type": "string"
          },
          "action_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Action Digest",
            "type": "string"
          },
          "input_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Input Digest",
            "type": "string"
          },
          "policy_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Policy Digest",
            "type": "string"
          },
          "policy_version": {
            "title": "Policy Version",
            "type": "string"
          },
          "generation": {
            "minimum": 0,
            "title": "Generation",
            "type": "integer"
          },
          "adapter_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Adapter Id",
            "type": "string"
          },
          "adapter_kind": {
            "enum": [
              "page",
              "computer"
            ],
            "title": "Adapter Kind",
            "type": "string"
          },
          "grant_revision": {
            "minimum": 0,
            "title": "Grant Revision",
            "type": "integer"
          },
          "scope_json": {
            "maxLength": 8192,
            "title": "Scope Json",
            "type": "string"
          },
          "content_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Content Sha256",
            "type": "string"
          },
          "content_size": {
            "minimum": 0,
            "title": "Content Size",
            "type": "integer"
          }
        },
        "required": [
          "principal_id",
          "profile_id",
          "agent_id",
          "runtime_session_id",
          "run_id",
          "operation_id",
          "effect_id",
          "approval_id",
          "approval_digest",
          "action_digest",
          "input_digest",
          "policy_digest",
          "policy_version",
          "generation",
          "adapter_id",
          "adapter_kind",
          "grant_revision",
          "scope_json",
          "content_sha256",
          "content_size"
        ],
        "title": "DotsEffectIdentity",
        "type": "object"
      },
      "DotsPagePrepareParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "proposal": {
            "$ref": "#/components/schemas/DotsPageProposal"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "command_id",
          "proposal"
        ],
        "title": "DotsPagePrepareParams",
        "type": "object"
      },
      "DotsPageProposal": {
        "additionalProperties": false,
        "properties": {
          "kind": {
            "const": "page",
            "default": "page",
            "title": "Kind",
            "type": "string"
          },
          "store_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Store Id",
            "type": "string"
          },
          "project_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Project Id",
            "type": "string"
          },
          "space_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Space Id",
            "type": "string"
          },
          "page_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Page Id",
            "type": "string"
          },
          "expected_head_version": {
            "minimum": 0,
            "title": "Expected Head Version",
            "type": "integer"
          },
          "expected_grant_revision": {
            "minimum": 0,
            "title": "Expected Grant Revision",
            "type": "integer"
          },
          "document": {
            "$ref": "#/components/schemas/DotsPageDocument"
          }
        },
        "required": [
          "store_id",
          "project_id",
          "space_id",
          "page_id",
          "expected_head_version",
          "expected_grant_revision",
          "document"
        ],
        "title": "DotsPageProposal",
        "type": "object"
      },
      "DotsPageDocument": {
        "additionalProperties": false,
        "properties": {
          "title": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Title",
            "type": "string"
          },
          "content": {
            "maxLength": 24000,
            "title": "Content",
            "type": "string"
          },
          "parent_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Parent Id"
          },
          "archived": {
            "title": "Archived",
            "type": "boolean"
          }
        },
        "required": [
          "title",
          "content",
          "parent_id",
          "archived"
        ],
        "title": "DotsPageDocument",
        "type": "object"
      },
      "DotsPreparedResult": {
        "additionalProperties": false,
        "properties": {
          "command_id": {
            "title": "Command Id",
            "type": "string"
          },
          "run_id": {
            "title": "Run Id",
            "type": "string"
          },
          "operation_id": {
            "title": "Operation Id",
            "type": "string"
          },
          "action_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Action Digest",
            "type": "string"
          },
          "input_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Input Digest",
            "type": "string"
          },
          "content_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Content Sha256",
            "type": "string"
          },
          "approval_id": {
            "title": "Approval Id",
            "type": "string"
          },
          "approval_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Approval Digest",
            "type": "string"
          },
          "expires_at": {
            "title": "Expires At",
            "type": "number"
          }
        },
        "required": [
          "command_id",
          "run_id",
          "operation_id",
          "action_digest",
          "input_digest",
          "content_sha256",
          "approval_id",
          "approval_digest",
          "expires_at"
        ],
        "title": "DotsPreparedResult",
        "type": "object"
      },
      "DotsPagePublishParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "proposal": {
            "$ref": "#/components/schemas/DotsPageProposal"
          },
          "approval_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Approval Id",
            "type": "string"
          },
          "approval_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Approval Digest",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "command_id",
          "proposal",
          "approval_id",
          "approval_digest"
        ],
        "title": "DotsPagePublishParams",
        "type": "object"
      },
      "DotsRegistrationParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "adapter_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Adapter Id",
            "type": "string"
          },
          "kind": {
            "enum": [
              "page",
              "computer"
            ],
            "title": "Kind",
            "type": "string"
          },
          "expected_revision": {
            "anyOf": [
              {
                "minimum": 0,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Expected Revision"
          },
          "revision": {
            "minimum": 0,
            "title": "Revision",
            "type": "integer"
          },
          "enabled": {
            "title": "Enabled",
            "type": "boolean"
          },
          "project_ids": {
            "default": [],
            "items": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "maxItems": 100,
            "title": "Project Ids",
            "type": "array"
          },
          "space_ids": {
            "default": [],
            "items": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "maxItems": 100,
            "title": "Space Ids",
            "type": "array"
          },
          "actions": {
            "default": [],
            "items": {
              "enum": [
                "navigate",
                "read",
                "snapshot",
                "screenshot",
                "click",
                "type",
                "key",
                "scroll",
                "files_list",
                "files_read",
                "files_write",
                "exec"
              ],
              "type": "string"
            },
            "maxItems": 12,
            "title": "Actions",
            "type": "array"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "adapter_id",
          "kind",
          "revision",
          "enabled"
        ],
        "title": "DotsRegistrationParams",
        "type": "object"
      },
      "DotsRegistrationResult": {
        "additionalProperties": false,
        "properties": {
          "adapter_id": {
            "title": "Adapter Id",
            "type": "string"
          },
          "kind": {
            "enum": [
              "page",
              "computer"
            ],
            "title": "Kind",
            "type": "string"
          },
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "enabled": {
            "title": "Enabled",
            "type": "boolean"
          },
          "agent_id": {
            "title": "Agent Id",
            "type": "string"
          },
          "registered": {
            "const": true,
            "title": "Registered",
            "type": "boolean"
          }
        },
        "required": [
          "adapter_id",
          "kind",
          "revision",
          "enabled",
          "agent_id",
          "registered"
        ],
        "title": "DotsRegistrationResult",
        "type": "object"
      },
      "RuntimeEffectParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "effect_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Effect Id",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "effect_id"
        ],
        "title": "RuntimeEffectParams",
        "type": "object"
      },
      "RuntimeEffectGetResult": {
        "additionalProperties": false,
        "properties": {
          "effect": {
            "$ref": "#/components/schemas/RuntimeEffectRecord"
          },
          "evidence": {
            "items": {
              "$ref": "#/components/schemas/RuntimeEffectEvidence"
            },
            "title": "Evidence",
            "type": "array"
          }
        },
        "required": [
          "effect",
          "evidence"
        ],
        "title": "RuntimeEffectGetResult",
        "type": "object"
      },
      "RuntimeEffectRecord": {
        "additionalProperties": false,
        "properties": {
          "effect_id": {
            "title": "Effect Id",
            "type": "string"
          },
          "run_id": {
            "title": "Run Id",
            "type": "string"
          },
          "operation_id": {
            "title": "Operation Id",
            "type": "string"
          },
          "operation_type": {
            "enum": [
              "artifact_publish",
              "project_artifact_publish",
              "mission_test_execution",
              "dots_page_publish",
              "dots_computer_action",
              "unsupported"
            ],
            "title": "Operation Type",
            "type": "string"
          },
          "state": {
            "enum": [
              "prepared",
              "dispatched",
              "confirmed",
              "failed",
              "outcome_unknown",
              "reconciliation_required"
            ],
            "title": "State",
            "type": "string"
          },
          "action_digest": {
            "title": "Action Digest",
            "type": "string"
          },
          "input_digest": {
            "title": "Input Digest",
            "type": "string"
          },
          "target_digest": {
            "title": "Target Digest",
            "type": "string"
          },
          "policy_version": {
            "title": "Policy Version",
            "type": "string"
          },
          "policy_digest": {
            "title": "Policy Digest",
            "type": "string"
          },
          "generation": {
            "title": "Generation",
            "type": "integer"
          },
          "approval_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Approval Id"
          },
          "provider_idempotency": {
            "enum": [
              "supported",
              "unsupported"
            ],
            "title": "Provider Idempotency",
            "type": "string"
          },
          "created_at": {
            "title": "Created At",
            "type": "number"
          },
          "updated_at": {
            "title": "Updated At",
            "type": "number"
          },
          "exactly_once_external": {
            "const": false,
            "title": "Exactly Once External",
            "type": "boolean"
          },
          "replay_permitted": {
            "const": false,
            "title": "Replay Permitted",
            "type": "boolean"
          }
        },
        "required": [
          "effect_id",
          "run_id",
          "operation_id",
          "operation_type",
          "state",
          "action_digest",
          "input_digest",
          "target_digest",
          "policy_version",
          "policy_digest",
          "generation",
          "approval_id",
          "provider_idempotency",
          "created_at",
          "updated_at",
          "exactly_once_external",
          "replay_permitted"
        ],
        "title": "RuntimeEffectRecord",
        "type": "object"
      },
      "RuntimeEffectEvidence": {
        "additionalProperties": false,
        "properties": {
          "sequence": {
            "title": "Sequence",
            "type": "integer"
          },
          "generation": {
            "title": "Generation",
            "type": "integer"
          },
          "from_state": {
            "enum": [
              "prepared",
              "dispatched",
              "confirmed",
              "failed",
              "outcome_unknown",
              "reconciliation_required"
            ],
            "title": "From State",
            "type": "string"
          },
          "state": {
            "enum": [
              "prepared",
              "dispatched",
              "confirmed",
              "failed",
              "outcome_unknown",
              "reconciliation_required"
            ],
            "title": "State",
            "type": "string"
          },
          "created_at": {
            "title": "Created At",
            "type": "number"
          },
          "receipt_available": {
            "title": "Receipt Available",
            "type": "boolean"
          },
          "receipt_sha256": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Receipt Sha256"
          }
        },
        "required": [
          "sequence",
          "generation",
          "from_state",
          "state",
          "created_at",
          "receipt_available",
          "receipt_sha256"
        ],
        "title": "RuntimeEffectEvidence",
        "type": "object"
      },
      "RuntimeEffectListParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "run_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Run Id"
          },
          "limit": {
            "default": 100,
            "maximum": 200,
            "minimum": 1,
            "title": "Limit",
            "type": "integer"
          },
          "unresolved_only": {
            "default": false,
            "title": "Unresolved Only",
            "type": "boolean"
          }
        },
        "required": [
          "session_id",
          "schema_version"
        ],
        "title": "RuntimeEffectListParams",
        "type": "object"
      },
      "RuntimeEffectListResult": {
        "additionalProperties": false,
        "properties": {
          "effects": {
            "items": {
              "$ref": "#/components/schemas/RuntimeEffectRecord"
            },
            "title": "Effects",
            "type": "array"
          },
          "limit": {
            "title": "Limit",
            "type": "integer"
          },
          "truncated": {
            "title": "Truncated",
            "type": "boolean"
          },
          "complete": {
            "const": false,
            "title": "Complete",
            "type": "boolean"
          }
        },
        "required": [
          "effects",
          "limit",
          "truncated",
          "complete"
        ],
        "title": "RuntimeEffectListResult",
        "type": "object"
      },
      "RuntimeEventsSinceParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "cursor": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Cursor"
          },
          "limit": {
            "default": 100,
            "maximum": 200,
            "minimum": 1,
            "title": "Limit",
            "type": "integer"
          }
        },
        "required": [
          "session_id",
          "schema_version"
        ],
        "title": "RuntimeEventsSinceParams",
        "type": "object"
      },
      "RuntimeEventsSinceResult": {
        "additionalProperties": false,
        "properties": {
          "status": {
            "enum": [
              "ok",
              "snapshot_required"
            ],
            "title": "Status",
            "type": "string"
          },
          "events": {
            "items": {
              "$ref": "#/components/schemas/RuntimeEventEnvelope"
            },
            "title": "Events",
            "type": "array"
          },
          "snapshot": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/MissionSnapshot"
              },
              {
                "type": "null"
              }
            ]
          },
          "last_cursor": {
            "title": "Last Cursor",
            "type": "string"
          },
          "has_more": {
            "title": "Has More",
            "type": "boolean"
          }
        },
        "required": [
          "status",
          "events",
          "snapshot",
          "last_cursor",
          "has_more"
        ],
        "title": "RuntimeEventsSinceResult",
        "type": "object"
      },
      "RuntimeEventEnvelope": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "event_id": {
            "title": "Event Id",
            "type": "string"
          },
          "session_id": {
            "title": "Session Id",
            "type": "string"
          },
          "seq": {
            "title": "Seq",
            "type": "integer"
          },
          "cursor": {
            "title": "Cursor",
            "type": "string"
          },
          "generation": {
            "title": "Generation",
            "type": "integer"
          },
          "mission_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Mission Id"
          },
          "run_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Run Id"
          },
          "operation_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Operation Id"
          },
          "effect_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Effect Id"
          },
          "delivery_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Delivery Id"
          },
          "approval_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Approval Id"
          },
          "occurred_at": {
            "title": "Occurred At",
            "type": "number"
          },
          "type": {
            "enum": [
              "command.accepted",
              "command.claimed",
              "command.completed",
              "command.failed",
              "command.blocked",
              "command.cancelled",
              "checkpoint.published",
              "runtime.output",
              "runtime.state",
              "approval.requested",
              "approval.resolved",
              "effect.recorded",
              "model.started",
              "model.completed",
              "model.failed",
              "tool.started",
              "tool.completed",
              "tool.failed",
              "decision.observed",
              "decision.outcome",
              "decision.tool_plan",
              "decision.policy",
              "decision.planner_miss",
              "operations.repair_started",
              "operations.repair_finished",
              "operations.deletion_requested",
              "operations.deletion_finished"
            ],
            "title": "Type",
            "type": "string"
          },
          "payload": {
            "$ref": "#/components/schemas/RuntimeEventPayload"
          }
        },
        "required": [
          "schema_version",
          "event_id",
          "session_id",
          "seq",
          "cursor",
          "generation",
          "mission_id",
          "run_id",
          "operation_id",
          "effect_id",
          "delivery_id",
          "approval_id",
          "occurred_at",
          "type",
          "payload"
        ],
        "title": "RuntimeEventEnvelope",
        "type": "object"
      },
      "RuntimeEventPayload": {
        "additionalProperties": false,
        "description": "Safe correlation metadata only. Raw model/tool outputs stay off this wire.",
        "properties": {
          "decision_receipt": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/DecisionReceipt"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "decision_outcome": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/DecisionOutcomeLabel"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "decision_tool_plan": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/DecisionToolPlan"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "decision_policy": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/DecisionPolicyRecord"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "decision_planner_miss": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/DecisionPlannerMiss"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "command_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Command Id"
          },
          "operation": {
            "anyOf": [
              {
                "enum": [
                  "submit",
                  "steer",
                  "cancel",
                  "approval"
                ],
                "type": "string"
              },
              {
                "const": "artifact",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Operation"
          },
          "effect_state": {
            "anyOf": [
              {
                "enum": [
                  "prepared",
                  "dispatched",
                  "confirmed",
                  "failed",
                  "outcome_unknown",
                  "reconciliation_required"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Effect State"
          },
          "operation_type": {
            "anyOf": [
              {
                "enum": [
                  "artifact_publish",
                  "project_artifact_publish",
                  "mission_test_execution",
                  "unsupported"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Operation Type"
          },
          "approval_status": {
            "anyOf": [
              {
                "enum": [
                  "pending",
                  "approved",
                  "denied",
                  "consumed",
                  "invalidated"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Approval Status"
          },
          "expires_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Expires At"
          },
          "invalidation_reason": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Invalidation Reason"
          },
          "mission_revision": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Mission Revision"
          },
          "mission_state": {
            "anyOf": [
              {
                "enum": [
                  "ready",
                  "working",
                  "waiting_for_user",
                  "waiting_for_source",
                  "ready_to_review",
                  "completed",
                  "partially_completed",
                  "paused",
                  "cancelled",
                  "failed"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Mission State"
          },
          "checkpoint_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Checkpoint Id"
          },
          "included_seq": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Included Seq"
          },
          "cancellation": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeCancellation"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "physical_attempt": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimePhysicalAttempt"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "admission_state": {
            "anyOf": [
              {
                "enum": [
                  "expired",
                  "cancelled",
                  "rejected"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Admission State"
          },
          "control_outcome": {
            "anyOf": [
              {
                "enum": [
                  "steer_queued",
                  "steer_not_queued",
                  "cancel_requested",
                  "cancel_not_requested"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Control Outcome"
          }
        },
        "title": "RuntimeEventPayload",
        "type": "object"
      },
      "DecisionReceipt": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "receipt_id": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Receipt Id",
            "type": "string"
          },
          "point_id": {
            "pattern": "^DP(0[1-9]|1[0-6])$",
            "title": "Point Id",
            "type": "string"
          },
          "contract_version": {
            "minimum": 1,
            "title": "Contract Version",
            "type": "integer"
          },
          "contract_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Contract Digest",
            "type": "string"
          },
          "question_id": {
            "pattern": "^[A-Za-z0-9_.:-]{1,96}$",
            "title": "Question Id",
            "type": "string"
          },
          "request_id": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Request Id",
            "type": "string"
          },
          "input_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Input Digest",
            "type": "string"
          },
          "scope_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Scope Digest",
            "type": "string"
          },
          "classification": {
            "enum": [
              "private",
              "public",
              "synthetic"
            ],
            "title": "Classification",
            "type": "string"
          },
          "model_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Model Digest",
            "type": "string"
          },
          "calibration_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Calibration Digest",
            "type": "string"
          },
          "service_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Service Digest",
            "type": "string"
          },
          "mode": {
            "enum": [
              "off",
              "shadow",
              "advisory",
              "enforce"
            ],
            "title": "Mode",
            "type": "string"
          },
          "thresholds": {
            "patternProperties": {
              "^[A-Za-z0-9_.:-]{1,96}$": {
                "maximum": 1,
                "minimum": 0,
                "type": "number"
              }
            },
            "title": "Thresholds",
            "type": "object"
          },
          "point_gate_digest": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Point Gate Digest"
          },
          "live_options": {
            "items": {
              "pattern": "^[A-Za-z0-9_.:-]{1,96}$",
              "type": "string"
            },
            "maxItems": 64,
            "minItems": 2,
            "title": "Live Options",
            "type": "array"
          },
          "distribution": {
            "anyOf": [
              {
                "patternProperties": {
                  "^[A-Za-z0-9_.:-]{1,96}$": {
                    "maximum": 1,
                    "minimum": 0,
                    "type": "number"
                  }
                },
                "type": "object"
              },
              {
                "type": "null"
              }
            ],
            "title": "Distribution"
          },
          "selected": {
            "anyOf": [
              {
                "pattern": "^[A-Za-z0-9_.:-]{1,96}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Selected"
          },
          "unclear": {
            "title": "Unclear",
            "type": "boolean"
          },
          "actual_route": {
            "enum": [
              "incumbent",
              "advisory",
              "qualified_recommendation"
            ],
            "title": "Actual Route",
            "type": "string"
          },
          "fallback": {
            "anyOf": [
              {
                "enum": [
                  "off",
                  "privacy_not_qualified",
                  "private_transport_unqualified",
                  "private_destination_authorization_required",
                  "point_gate_required",
                  "durable_receipt_required",
                  "transport_unconfigured",
                  "deadline_exceeded",
                  "node_capacity",
                  "node_unavailable",
                  "node_http_error",
                  "circuit_open",
                  "invalid_response_schema",
                  "response_binding_mismatch",
                  "bundle_mismatch",
                  "invalid_distribution_options",
                  "invalid_probability",
                  "invalid_distribution_sum",
                  "invalid_selection",
                  "invalid_unclear",
                  "selection_not_argmax",
                  "invalid_latency",
                  "unclear",
                  "below_threshold",
                  "shadow_observation",
                  "receipt_unavailable"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Fallback"
          },
          "incumbent": {
            "pattern": "^[A-Za-z0-9_.:-]{1,96}$",
            "title": "Incumbent",
            "type": "string"
          },
          "latency_ms": {
            "minimum": 0,
            "title": "Latency Ms",
            "type": "number"
          },
          "node_latency_ms": {
            "anyOf": [
              {
                "minimum": 0,
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Node Latency Ms"
          },
          "recorded_at": {
            "minimum": 0,
            "title": "Recorded At",
            "type": "number"
          },
          "outcome": {
            "title": "Outcome",
            "type": "null"
          },
          "raw_state_retained": {
            "const": false,
            "title": "Raw State Retained",
            "type": "boolean"
          }
        },
        "required": [
          "schema_version",
          "receipt_id",
          "point_id",
          "contract_version",
          "contract_digest",
          "question_id",
          "request_id",
          "input_digest",
          "scope_digest",
          "classification",
          "model_digest",
          "calibration_digest",
          "service_digest",
          "mode",
          "thresholds",
          "point_gate_digest",
          "live_options",
          "distribution",
          "selected",
          "unclear",
          "actual_route",
          "fallback",
          "incumbent",
          "latency_ms",
          "node_latency_ms",
          "recorded_at",
          "outcome",
          "raw_state_retained"
        ],
        "title": "DecisionReceipt",
        "type": "object"
      },
      "DecisionOutcomeLabel": {
        "additionalProperties": false,
        "properties": {
          "receipt_id": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Receipt Id",
            "type": "string"
          },
          "label": {
            "pattern": "^[A-Za-z0-9_.:-]{1,96}$",
            "title": "Label",
            "type": "string"
          },
          "outcome": {
            "enum": [
              "correct",
              "incorrect",
              "unresolved",
              "recovered"
            ],
            "title": "Outcome",
            "type": "string"
          },
          "source_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Source Digest",
            "type": "string"
          }
        },
        "required": [
          "receipt_id",
          "label",
          "outcome",
          "source_digest"
        ],
        "title": "DecisionOutcomeLabel",
        "type": "object"
      },
      "DecisionToolPlan": {
        "additionalProperties": false,
        "properties": {
          "need": {
            "enum": [
              "no_tools",
              "needs_tools",
              "defer"
            ],
            "title": "Need",
            "type": "string"
          },
          "effort_bucket": {
            "enum": [
              "one",
              "two_three",
              "four_plus",
              "defer"
            ],
            "title": "Effort Bucket",
            "type": "string"
          },
          "families": {
            "items": {
              "pattern": "^[A-Za-z0-9_.:-]{1,96}$",
              "type": "string"
            },
            "maxItems": 16,
            "title": "Families",
            "type": "array"
          },
          "verified_tool_ids": {
            "items": {
              "pattern": "^[A-Za-z0-9_.:-]{1,96}$",
              "type": "string"
            },
            "maxItems": 16,
            "title": "Verified Tool Ids",
            "type": "array"
          },
          "live_catalog_version": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Live Catalog Version",
            "type": "string"
          },
          "bundle_id": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Bundle Id",
            "type": "string"
          },
          "reopen_policy": {
            "const": "authorized_search_describe_call",
            "title": "Reopen Policy",
            "type": "string"
          },
          "scope_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Scope Digest",
            "type": "string"
          },
          "mode": {
            "enum": [
              "off",
              "shadow",
              "advisory",
              "enforce"
            ],
            "title": "Mode",
            "type": "string"
          },
          "fallback": {
            "anyOf": [
              {
                "pattern": "^[A-Za-z0-9_.:-]{1,96}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Fallback"
          },
          "decision_receipt_ids": {
            "items": {
              "pattern": "^[0-9a-f]{64}$",
              "type": "string"
            },
            "maxItems": 50,
            "title": "Decision Receipt Ids",
            "type": "array"
          },
          "elapsed_ms": {
            "minimum": 0,
            "title": "Elapsed Ms",
            "type": "number"
          }
        },
        "required": [
          "need",
          "effort_bucket",
          "families",
          "verified_tool_ids",
          "live_catalog_version",
          "bundle_id",
          "reopen_policy",
          "scope_digest",
          "mode",
          "fallback",
          "decision_receipt_ids",
          "elapsed_ms"
        ],
        "title": "DecisionToolPlan",
        "type": "object"
      },
      "DecisionPolicyRecord": {
        "additionalProperties": false,
        "properties": {
          "kind": {
            "const": "point_policy",
            "title": "Kind",
            "type": "string"
          },
          "operation": {
            "enum": [
              "observer",
              "promote",
              "rollback"
            ],
            "title": "Operation",
            "type": "string"
          },
          "point_id": {
            "pattern": "^DP(0[1-9]|1[0-6])$",
            "title": "Point Id",
            "type": "string"
          },
          "policy_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Policy Digest",
            "type": "string"
          },
          "scope_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Scope Digest",
            "type": "string"
          },
          "mode": {
            "anyOf": [
              {
                "enum": [
                  "off",
                  "shadow",
                  "advisory",
                  "enforce"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Mode"
          },
          "thresholds_by_class": {
            "anyOf": [
              {
                "items": {
                  "maxItems": 2,
                  "minItems": 2,
                  "prefixItems": [
                    {
                      "pattern": "^[A-Za-z0-9_.:-]{1,96}$",
                      "type": "string"
                    },
                    {
                      "maximum": 1,
                      "minimum": 0,
                      "type": "number"
                    }
                  ],
                  "type": "array"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Thresholds By Class"
          },
          "timeout_seconds": {
            "anyOf": [
              {
                "maximum": 1,
                "minimum": 0.001,
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Timeout Seconds"
          },
          "allowed_effects": {
            "anyOf": [
              {
                "items": {
                  "pattern": "^[A-Za-z0-9_.:-]{1,96}$",
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Allowed Effects"
          },
          "rollout_scope": {
            "anyOf": [
              {
                "items": {
                  "pattern": "^[0-9a-f]{64}$",
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Rollout Scope"
          },
          "gate_digest": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Gate Digest"
          },
          "evidence_digest": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Evidence Digest"
          },
          "approval_digest": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Approval Digest"
          },
          "previous_policy_digest": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Previous Policy Digest"
          },
          "bundle": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/DecisionReleaseBundle"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "recorded_at": {
            "anyOf": [
              {
                "minimum": 0,
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Recorded At"
          },
          "reason": {
            "anyOf": [
              {
                "enum": [
                  "operator",
                  "drift",
                  "false_allow",
                  "missed_direct_request",
                  "stale_menu",
                  "tool_recovery_failed",
                  "budget_violation",
                  "latency_regression"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Reason"
          }
        },
        "required": [
          "kind",
          "operation",
          "point_id",
          "policy_digest",
          "scope_digest"
        ],
        "title": "DecisionPolicyRecord",
        "type": "object"
      },
      "DecisionReleaseBundle": {
        "additionalProperties": false,
        "properties": {
          "model_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Model Digest",
            "type": "string"
          },
          "calibration_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Calibration Digest",
            "type": "string"
          },
          "service_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Service Digest",
            "type": "string"
          }
        },
        "required": [
          "model_digest",
          "calibration_digest",
          "service_digest"
        ],
        "title": "DecisionReleaseBundle",
        "type": "object"
      },
      "DecisionPlannerMiss": {
        "additionalProperties": false,
        "properties": {
          "kind": {
            "const": "planner_miss",
            "title": "Kind",
            "type": "string"
          },
          "scope_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Scope Digest",
            "type": "string"
          },
          "bundle_id": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Bundle Id"
          },
          "catalog_version": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Catalog Version",
            "type": "string"
          },
          "previous_catalog_version": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Previous Catalog Version",
            "type": "string"
          },
          "tool_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Tool Digest",
            "type": "string"
          },
          "recovered": {
            "title": "Recovered",
            "type": "boolean"
          },
          "reason": {
            "enum": [
              "authorized_reopen",
              "not_authorized_or_unavailable"
            ],
            "title": "Reason",
            "type": "string"
          },
          "prefix_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Prefix Digest",
            "type": "string"
          },
          "observation_only": {
            "default": false,
            "title": "Observation Only",
            "type": "boolean"
          }
        },
        "required": [
          "kind",
          "scope_digest",
          "bundle_id",
          "catalog_version",
          "previous_catalog_version",
          "tool_digest",
          "recovered",
          "reason",
          "prefix_digest"
        ],
        "title": "DecisionPlannerMiss",
        "type": "object"
      },
      "RuntimeCancellation": {
        "additionalProperties": false,
        "properties": {
          "request_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Request Id"
          },
          "requested_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Requested At"
          },
          "local_state": {
            "enum": [
              "running",
              "requested",
              "stopped"
            ],
            "title": "Local State",
            "type": "string"
          },
          "upstream_ack": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ],
            "title": "Upstream Ack"
          },
          "pending_effect_ids": {
            "items": {
              "type": "string"
            },
            "title": "Pending Effect Ids",
            "type": "array"
          },
          "pending_handles": {
            "items": {
              "type": "string"
            },
            "title": "Pending Handles",
            "type": "array"
          },
          "partial_result_available": {
            "title": "Partial Result Available",
            "type": "boolean"
          },
          "remote_effects_undone": {
            "const": false,
            "title": "Remote Effects Undone",
            "type": "boolean"
          }
        },
        "required": [
          "request_id",
          "requested_at",
          "local_state",
          "upstream_ack",
          "pending_effect_ids",
          "pending_handles",
          "partial_result_available",
          "remote_effects_undone"
        ],
        "title": "RuntimeCancellation",
        "type": "object"
      },
      "RuntimePhysicalAttempt": {
        "additionalProperties": false,
        "description": "Opaque account correlation only, never credentials, endpoint or payload.",
        "properties": {
          "attempt_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Attempt Id",
            "type": "string"
          },
          "reason": {
            "enum": [
              "initial",
              "auth_failure",
              "quota_exhausted",
              "throttled",
              "overloaded",
              "context_overflow",
              "unsupported_capability",
              "ambiguous_transport",
              "request_rejected"
            ],
            "title": "Reason",
            "type": "string"
          },
          "provider_account_ref": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Provider Account Ref",
            "type": "string"
          },
          "reservation_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Reservation Id",
            "type": "string"
          },
          "remote_acceptance": {
            "enum": [
              "unknown",
              "rejected",
              "accepted"
            ],
            "title": "Remote Acceptance",
            "type": "string"
          },
          "logical_request_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Logical Request Id",
            "type": "string"
          }
        },
        "required": [
          "attempt_id",
          "reason",
          "provider_account_ref",
          "reservation_id",
          "remote_acceptance",
          "logical_request_id"
        ],
        "title": "RuntimePhysicalAttempt",
        "type": "object"
      },
      "MissionSnapshot": {
        "additionalProperties": false,
        "properties": {
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "session_id": {
            "title": "Session Id",
            "type": "string"
          },
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "state": {
            "$ref": "#/components/schemas/RuntimeSnapshotState"
          },
          "outstanding_requests": {
            "items": {
              "$ref": "#/components/schemas/RuntimeOutstandingRequest"
            },
            "title": "Outstanding Requests",
            "type": "array"
          },
          "artifacts": {
            "items": {
              "$ref": "#/components/schemas/RuntimeArtifactReference"
            },
            "title": "Artifacts",
            "type": "array"
          },
          "unresolved_effects": {
            "items": {
              "$ref": "#/components/schemas/RuntimeUnresolvedEffect"
            },
            "title": "Unresolved Effects",
            "type": "array"
          },
          "unresolved_invocations": {
            "items": {
              "$ref": "#/components/schemas/RuntimeUnresolvedInvocation"
            },
            "title": "Unresolved Invocations",
            "type": "array"
          },
          "reference_counts": {
            "$ref": "#/components/schemas/RuntimeReferenceCounts"
          },
          "reference_limit": {
            "default": 100,
            "title": "Reference Limit",
            "type": "integer"
          },
          "references_truncated": {
            "default": false,
            "title": "References Truncated",
            "type": "boolean"
          },
          "last_cursor": {
            "title": "Last Cursor",
            "type": "string"
          },
          "compatibility_status": {
            "enum": [
              "native",
              "legacy"
            ],
            "title": "Compatibility Status",
            "type": "string"
          },
          "admission": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RuntimeAdmissionSnapshot"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          }
        },
        "required": [
          "schema_version",
          "session_id",
          "revision",
          "state",
          "outstanding_requests",
          "artifacts",
          "unresolved_effects",
          "last_cursor",
          "compatibility_status"
        ],
        "title": "MissionSnapshot",
        "type": "object"
      },
      "RuntimeSnapshotState": {
        "additionalProperties": false,
        "properties": {
          "status": {
            "enum": [
              "idle",
              "accepted",
              "claimed",
              "completed",
              "failed",
              "blocked",
              "cancelled"
            ],
            "title": "Status",
            "type": "string"
          },
          "run_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Run Id"
          },
          "last_command_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Last Command Id"
          },
          "last_operation": {
            "anyOf": [
              {
                "enum": [
                  "submit",
                  "steer",
                  "cancel",
                  "approval"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Last Operation"
          }
        },
        "required": [
          "status",
          "run_id",
          "last_command_id",
          "last_operation"
        ],
        "title": "RuntimeSnapshotState",
        "type": "object"
      },
      "RuntimeOutstandingRequest": {
        "additionalProperties": false,
        "properties": {
          "request_id": {
            "title": "Request Id",
            "type": "string"
          },
          "kind": {
            "enum": [
              "approval",
              "input"
            ],
            "title": "Kind",
            "type": "string"
          },
          "status": {
            "const": "pending",
            "title": "Status",
            "type": "string"
          }
        },
        "required": [
          "request_id",
          "kind",
          "status"
        ],
        "title": "RuntimeOutstandingRequest",
        "type": "object"
      },
      "RuntimeArtifactReference": {
        "additionalProperties": false,
        "properties": {
          "artifact_id": {
            "title": "Artifact Id",
            "type": "string"
          },
          "version": {
            "title": "Version",
            "type": "string"
          }
        },
        "required": [
          "artifact_id",
          "version"
        ],
        "title": "RuntimeArtifactReference",
        "type": "object"
      },
      "RuntimeUnresolvedEffect": {
        "additionalProperties": false,
        "properties": {
          "effect_id": {
            "title": "Effect Id",
            "type": "string"
          },
          "status": {
            "enum": [
              "prepared",
              "dispatched",
              "outcome_unknown",
              "reconciliation_required"
            ],
            "title": "Status",
            "type": "string"
          }
        },
        "required": [
          "effect_id",
          "status"
        ],
        "title": "RuntimeUnresolvedEffect",
        "type": "object"
      },
      "RuntimeUnresolvedInvocation": {
        "additionalProperties": false,
        "properties": {
          "operation_id": {
            "title": "Operation Id",
            "type": "string"
          },
          "status": {
            "enum": [
              "pending",
              "outcome_uncertain"
            ],
            "title": "Status",
            "type": "string"
          }
        },
        "required": [
          "operation_id",
          "status"
        ],
        "title": "RuntimeUnresolvedInvocation",
        "type": "object"
      },
      "RuntimeReferenceCounts": {
        "additionalProperties": false,
        "properties": {
          "outstanding_requests": {
            "default": 0,
            "title": "Outstanding Requests",
            "type": "integer"
          },
          "artifacts": {
            "default": 0,
            "title": "Artifacts",
            "type": "integer"
          },
          "unresolved_effects": {
            "default": 0,
            "title": "Unresolved Effects",
            "type": "integer"
          },
          "unresolved_invocations": {
            "default": 0,
            "title": "Unresolved Invocations",
            "type": "integer"
          }
        },
        "title": "RuntimeReferenceCounts",
        "type": "object"
      },
      "RuntimeAdmissionSnapshot": {
        "additionalProperties": false,
        "properties": {
          "draining": {
            "title": "Draining",
            "type": "boolean"
          },
          "jobs": {
            "items": {
              "$ref": "#/components/schemas/RuntimeAdmissionJob"
            },
            "title": "Jobs",
            "type": "array"
          }
        },
        "required": [
          "draining",
          "jobs"
        ],
        "title": "RuntimeAdmissionSnapshot",
        "type": "object"
      },
      "RuntimeAdmissionJob": {
        "additionalProperties": false,
        "properties": {
          "command_id": {
            "title": "Command Id",
            "type": "string"
          },
          "state": {
            "enum": [
              "queued",
              "running",
              "finished",
              "expired",
              "cancelled",
              "rejected"
            ],
            "title": "State",
            "type": "string"
          },
          "enqueued_at": {
            "title": "Enqueued At",
            "type": "number"
          },
          "expires_at": {
            "title": "Expires At",
            "type": "number"
          },
          "reason": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Reason"
          }
        },
        "required": [
          "command_id",
          "state",
          "enqueued_at",
          "expires_at",
          "reason"
        ],
        "title": "RuntimeAdmissionJob",
        "type": "object"
      },
      "MissionControlParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "mission_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Mission Id"
          },
          "expected_revision": {
            "minimum": 1,
            "title": "Expected Revision",
            "type": "integer"
          },
          "reason": {
            "default": "",
            "maxLength": 1024,
            "title": "Reason",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "expected_revision"
        ],
        "title": "MissionControlParams",
        "type": "object"
      },
      "MissionResult": {
        "additionalProperties": false,
        "properties": {
          "mission": {
            "$ref": "#/components/schemas/MissionRecord"
          },
          "dispatch_performed": {
            "const": false,
            "default": false,
            "title": "Dispatch Performed",
            "type": "boolean"
          }
        },
        "required": [
          "mission"
        ],
        "title": "MissionResult",
        "type": "object"
      },
      "MissionRecord": {
        "additionalProperties": false,
        "properties": {
          "outcome": {
            "maxLength": 16384,
            "minLength": 1,
            "title": "Outcome",
            "type": "string"
          },
          "project_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Project Id"
          },
          "deliverables": {
            "items": {
              "$ref": "#/components/schemas/MissionDeliverable"
            },
            "maxItems": 100,
            "title": "Deliverables",
            "type": "array"
          },
          "acceptance": {
            "items": {
              "discriminator": {
                "mapping": {
                  "existence": "#/components/schemas/MissionExistenceCriterion",
                  "json_schema": "#/components/schemas/MissionSchemaCriterion",
                  "linked_consistency": "#/components/schemas/MissionLinkedCriterion",
                  "markdown_sections": "#/components/schemas/MissionSectionCriterion",
                  "test_execution": "#/components/schemas/MissionTestCriterion",
                  "text_exact": "#/components/schemas/MissionTextCriterion",
                  "user_acceptance": "#/components/schemas/MissionUserCriterion"
                },
                "propertyName": "kind"
              },
              "oneOf": [
                {
                  "$ref": "#/components/schemas/MissionExistenceCriterion"
                },
                {
                  "$ref": "#/components/schemas/MissionSectionCriterion"
                },
                {
                  "$ref": "#/components/schemas/MissionTextCriterion"
                },
                {
                  "$ref": "#/components/schemas/MissionSchemaCriterion"
                },
                {
                  "$ref": "#/components/schemas/MissionLinkedCriterion"
                },
                {
                  "$ref": "#/components/schemas/MissionTestCriterion"
                },
                {
                  "$ref": "#/components/schemas/MissionUserCriterion"
                }
              ]
            },
            "maxItems": 32,
            "title": "Acceptance",
            "type": "array"
          },
          "scope_ref": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Scope Ref"
          },
          "budget_ref": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Budget Ref"
          },
          "deadline": {
            "anyOf": [
              {
                "maximum": 253402300799,
                "minimum": 0,
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Deadline"
          },
          "dependencies": {
            "items": {
              "$ref": "#/components/schemas/MissionDependency"
            },
            "maxItems": 64,
            "title": "Dependencies",
            "type": "array"
          },
          "plan_steps": {
            "items": {
              "$ref": "#/components/schemas/MissionPlanStep"
            },
            "maxItems": 100,
            "title": "Plan Steps",
            "type": "array"
          },
          "policy": {
            "default": "reviewed",
            "enum": [
              "direct",
              "reviewed"
            ],
            "title": "Policy",
            "type": "string"
          },
          "risk": {
            "default": "unknown",
            "enum": [
              "unknown",
              "low",
              "consequential"
            ],
            "title": "Risk",
            "type": "string"
          },
          "uncertainty": {
            "default": "unknown",
            "enum": [
              "unknown",
              "low",
              "high"
            ],
            "title": "Uncertainty",
            "type": "string"
          },
          "max_turns": {
            "default": 20,
            "maximum": 100,
            "minimum": 1,
            "title": "Max Turns",
            "type": "integer"
          },
          "no_progress_limit": {
            "default": 2,
            "maximum": 5,
            "minimum": 1,
            "title": "No Progress Limit",
            "type": "integer"
          },
          "legacy_contract": {
            "$ref": "#/components/schemas/MissionLegacyContract"
          },
          "subgoals": {
            "items": {
              "maxLength": 4096,
              "type": "string"
            },
            "maxItems": 100,
            "title": "Subgoals",
            "type": "array"
          },
          "gates": {
            "items": {
              "$ref": "#/components/schemas/MissionHistoricalGate"
            },
            "maxItems": 100,
            "title": "Gates",
            "type": "array"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "mission_id": {
            "title": "Mission Id",
            "type": "string"
          },
          "session_id": {
            "title": "Session Id",
            "type": "string"
          },
          "agent_id": {
            "title": "Agent Id",
            "type": "string"
          },
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "state": {
            "enum": [
              "ready",
              "working",
              "waiting_for_user",
              "waiting_for_source",
              "ready_to_review",
              "completed",
              "partially_completed",
              "paused",
              "cancelled",
              "failed"
            ],
            "title": "State",
            "type": "string"
          },
          "execution_status": {
            "title": "Execution Status",
            "type": "string"
          },
          "acceptance_status": {
            "title": "Acceptance Status",
            "type": "string"
          },
          "delivery_status": {
            "title": "Delivery Status",
            "type": "string"
          },
          "next_step": {
            "title": "Next Step",
            "type": "string"
          },
          "blockers": {
            "items": {
              "type": "string"
            },
            "title": "Blockers",
            "type": "array"
          },
          "artifact_refs": {
            "items": {
              "$ref": "#/components/schemas/MissionArtifactRef"
            },
            "title": "Artifact Refs",
            "type": "array"
          },
          "effect_refs": {
            "items": {
              "$ref": "#/components/schemas/MissionEffectRef"
            },
            "title": "Effect Refs",
            "type": "array"
          },
          "delivery_refs": {
            "items": {
              "$ref": "#/components/schemas/MissionDeliveryRef"
            },
            "title": "Delivery Refs",
            "type": "array"
          },
          "effect_refs_total": {
            "default": 0,
            "title": "Effect Refs Total",
            "type": "integer"
          },
          "effect_refs_truncated": {
            "default": false,
            "title": "Effect Refs Truncated",
            "type": "boolean"
          },
          "delivery_refs_total": {
            "default": 0,
            "title": "Delivery Refs Total",
            "type": "integer"
          },
          "delivery_refs_truncated": {
            "default": false,
            "title": "Delivery Refs Truncated",
            "type": "boolean"
          },
          "verification_current": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Verification Current"
          },
          "turns_used": {
            "title": "Turns Used",
            "type": "integer"
          },
          "consecutive_no_progress": {
            "title": "Consecutive No Progress",
            "type": "integer"
          },
          "verification_rounds": {
            "title": "Verification Rounds",
            "type": "integer"
          },
          "last_run_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Last Run Id"
          },
          "paused_reason": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Paused Reason"
          },
          "recovery_choices": {
            "items": {
              "type": "string"
            },
            "title": "Recovery Choices",
            "type": "array"
          },
          "missed_steer": {
            "items": {
              "$ref": "#/components/schemas/MissionMissedSteer"
            },
            "title": "Missed Steer",
            "type": "array"
          },
          "created_at": {
            "title": "Created At",
            "type": "number"
          },
          "updated_at": {
            "title": "Updated At",
            "type": "number"
          },
          "legacy_imported": {
            "title": "Legacy Imported",
            "type": "boolean"
          },
          "archived": {
            "default": false,
            "title": "Archived",
            "type": "boolean"
          },
          "archived_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Archived At"
          }
        },
        "required": [
          "outcome",
          "schema_version",
          "mission_id",
          "session_id",
          "agent_id",
          "revision",
          "state",
          "execution_status",
          "acceptance_status",
          "delivery_status",
          "next_step",
          "blockers",
          "artifact_refs",
          "effect_refs",
          "delivery_refs",
          "turns_used",
          "consecutive_no_progress",
          "verification_rounds",
          "last_run_id",
          "paused_reason",
          "recovery_choices",
          "missed_steer",
          "created_at",
          "updated_at",
          "legacy_imported"
        ],
        "title": "MissionRecord",
        "type": "object"
      },
      "MissionDeliverable": {
        "additionalProperties": false,
        "properties": {
          "deliverable_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Deliverable Id",
            "type": "string"
          },
          "description": {
            "default": "",
            "maxLength": 4096,
            "title": "Description",
            "type": "string"
          },
          "artifact_ref": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/MissionArtifactRef"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "required": {
            "default": true,
            "title": "Required",
            "type": "boolean"
          }
        },
        "required": [
          "deliverable_id"
        ],
        "title": "MissionDeliverable",
        "type": "object"
      },
      "MissionArtifactRef": {
        "additionalProperties": false,
        "properties": {
          "artifact_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Artifact Id",
            "type": "string"
          },
          "version": {
            "exclusiveMaximum": 2147483648,
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Digest",
            "type": "string"
          }
        },
        "required": [
          "artifact_id",
          "version",
          "digest"
        ],
        "title": "MissionArtifactRef",
        "type": "object"
      },
      "MissionExistenceCriterion": {
        "additionalProperties": false,
        "properties": {
          "criterion_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Criterion Id",
            "type": "string"
          },
          "description": {
            "default": "",
            "maxLength": 4096,
            "title": "Description",
            "type": "string"
          },
          "artifact_refs": {
            "items": {
              "$ref": "#/components/schemas/MissionArtifactRef"
            },
            "maxItems": 16,
            "title": "Artifact Refs",
            "type": "array"
          },
          "required": {
            "default": true,
            "title": "Required",
            "type": "boolean"
          },
          "kind": {
            "const": "existence",
            "title": "Kind",
            "type": "string"
          },
          "parameters": {
            "$ref": "#/components/schemas/MissionReadParameters"
          }
        },
        "required": [
          "criterion_id",
          "kind"
        ],
        "title": "MissionExistenceCriterion",
        "type": "object"
      },
      "MissionReadParameters": {
        "additionalProperties": false,
        "properties": {
          "require_current_head": {
            "default": true,
            "title": "Require Current Head",
            "type": "boolean"
          },
          "require_current_dependencies": {
            "default": true,
            "title": "Require Current Dependencies",
            "type": "boolean"
          }
        },
        "title": "MissionReadParameters",
        "type": "object"
      },
      "MissionSectionCriterion": {
        "additionalProperties": false,
        "properties": {
          "criterion_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Criterion Id",
            "type": "string"
          },
          "description": {
            "default": "",
            "maxLength": 4096,
            "title": "Description",
            "type": "string"
          },
          "artifact_refs": {
            "items": {
              "$ref": "#/components/schemas/MissionArtifactRef"
            },
            "maxItems": 16,
            "title": "Artifact Refs",
            "type": "array"
          },
          "required": {
            "default": true,
            "title": "Required",
            "type": "boolean"
          },
          "kind": {
            "const": "markdown_sections",
            "title": "Kind",
            "type": "string"
          },
          "parameters": {
            "$ref": "#/components/schemas/MissionSectionParameters"
          }
        },
        "required": [
          "criterion_id",
          "kind",
          "parameters"
        ],
        "title": "MissionSectionCriterion",
        "type": "object"
      },
      "MissionSectionParameters": {
        "additionalProperties": false,
        "properties": {
          "require_current_head": {
            "default": true,
            "title": "Require Current Head",
            "type": "boolean"
          },
          "require_current_dependencies": {
            "default": true,
            "title": "Require Current Dependencies",
            "type": "boolean"
          },
          "required_sections": {
            "items": {
              "maxLength": 4096,
              "type": "string"
            },
            "maxItems": 64,
            "minItems": 1,
            "title": "Required Sections",
            "type": "array"
          },
          "nonempty": {
            "default": true,
            "title": "Nonempty",
            "type": "boolean"
          }
        },
        "required": [
          "required_sections"
        ],
        "title": "MissionSectionParameters",
        "type": "object"
      },
      "MissionTextCriterion": {
        "additionalProperties": false,
        "properties": {
          "criterion_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Criterion Id",
            "type": "string"
          },
          "description": {
            "default": "",
            "maxLength": 4096,
            "title": "Description",
            "type": "string"
          },
          "artifact_refs": {
            "items": {
              "$ref": "#/components/schemas/MissionArtifactRef"
            },
            "maxItems": 16,
            "title": "Artifact Refs",
            "type": "array"
          },
          "required": {
            "default": true,
            "title": "Required",
            "type": "boolean"
          },
          "kind": {
            "const": "text_exact",
            "title": "Kind",
            "type": "string"
          },
          "parameters": {
            "$ref": "#/components/schemas/MissionTextParameters"
          }
        },
        "required": [
          "criterion_id",
          "kind",
          "parameters"
        ],
        "title": "MissionTextCriterion",
        "type": "object"
      },
      "MissionTextParameters": {
        "additionalProperties": false,
        "properties": {
          "require_current_head": {
            "default": true,
            "title": "Require Current Head",
            "type": "boolean"
          },
          "require_current_dependencies": {
            "default": true,
            "title": "Require Current Dependencies",
            "type": "boolean"
          },
          "contains": {
            "items": {
              "maxLength": 4096,
              "type": "string"
            },
            "maxItems": 64,
            "title": "Contains",
            "type": "array"
          },
          "excludes": {
            "items": {
              "maxLength": 4096,
              "type": "string"
            },
            "maxItems": 64,
            "title": "Excludes",
            "type": "array"
          },
          "equals": {
            "anyOf": [
              {
                "maxLength": 4096,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Equals"
          }
        },
        "title": "MissionTextParameters",
        "type": "object"
      },
      "MissionSchemaCriterion": {
        "additionalProperties": false,
        "properties": {
          "criterion_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Criterion Id",
            "type": "string"
          },
          "description": {
            "default": "",
            "maxLength": 4096,
            "title": "Description",
            "type": "string"
          },
          "artifact_refs": {
            "items": {
              "$ref": "#/components/schemas/MissionArtifactRef"
            },
            "maxItems": 16,
            "title": "Artifact Refs",
            "type": "array"
          },
          "required": {
            "default": true,
            "title": "Required",
            "type": "boolean"
          },
          "kind": {
            "const": "json_schema",
            "title": "Kind",
            "type": "string"
          },
          "parameters": {
            "$ref": "#/components/schemas/MissionSchemaParameters"
          }
        },
        "required": [
          "criterion_id",
          "kind",
          "parameters"
        ],
        "title": "MissionSchemaCriterion",
        "type": "object"
      },
      "MissionSchemaParameters": {
        "additionalProperties": false,
        "properties": {
          "require_current_head": {
            "default": true,
            "title": "Require Current Head",
            "type": "boolean"
          },
          "require_current_dependencies": {
            "default": true,
            "title": "Require Current Dependencies",
            "type": "boolean"
          },
          "schema": {
            "additionalProperties": true,
            "title": "Schema",
            "type": "object"
          }
        },
        "required": [
          "schema"
        ],
        "title": "MissionSchemaParameters",
        "type": "object"
      },
      "MissionLinkedCriterion": {
        "additionalProperties": false,
        "properties": {
          "criterion_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Criterion Id",
            "type": "string"
          },
          "description": {
            "default": "",
            "maxLength": 4096,
            "title": "Description",
            "type": "string"
          },
          "artifact_refs": {
            "items": {
              "$ref": "#/components/schemas/MissionArtifactRef"
            },
            "maxItems": 16,
            "title": "Artifact Refs",
            "type": "array"
          },
          "required": {
            "default": true,
            "title": "Required",
            "type": "boolean"
          },
          "kind": {
            "const": "linked_consistency",
            "title": "Kind",
            "type": "string"
          },
          "parameters": {
            "$ref": "#/components/schemas/MissionLinkedParameters"
          }
        },
        "required": [
          "criterion_id",
          "kind",
          "parameters"
        ],
        "title": "MissionLinkedCriterion",
        "type": "object"
      },
      "MissionLinkedParameters": {
        "additionalProperties": false,
        "properties": {
          "require_current_head": {
            "default": true,
            "title": "Require Current Head",
            "type": "boolean"
          },
          "require_current_dependencies": {
            "default": true,
            "title": "Require Current Dependencies",
            "type": "boolean"
          },
          "sections": {
            "items": {
              "$ref": "#/components/schemas/MissionLinkedSection"
            },
            "maxItems": 64,
            "title": "Sections",
            "type": "array"
          },
          "tokens": {
            "items": {
              "maxLength": 4096,
              "type": "string"
            },
            "maxItems": 64,
            "title": "Tokens",
            "type": "array"
          }
        },
        "title": "MissionLinkedParameters",
        "type": "object"
      },
      "MissionLinkedSection": {
        "additionalProperties": false,
        "properties": {
          "artifact_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Artifact Id",
            "type": "string"
          },
          "heading": {
            "maxLength": 4096,
            "title": "Heading",
            "type": "string"
          }
        },
        "required": [
          "artifact_id",
          "heading"
        ],
        "title": "MissionLinkedSection",
        "type": "object"
      },
      "MissionTestCriterion": {
        "additionalProperties": false,
        "properties": {
          "criterion_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Criterion Id",
            "type": "string"
          },
          "description": {
            "default": "",
            "maxLength": 4096,
            "title": "Description",
            "type": "string"
          },
          "artifact_refs": {
            "items": {
              "$ref": "#/components/schemas/MissionArtifactRef"
            },
            "maxItems": 16,
            "title": "Artifact Refs",
            "type": "array"
          },
          "required": {
            "default": true,
            "title": "Required",
            "type": "boolean"
          },
          "kind": {
            "const": "test_execution",
            "title": "Kind",
            "type": "string"
          },
          "parameters": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/MissionIsolatedTestParameters"
              },
              {
                "$ref": "#/components/schemas/MissionTestParameters"
              }
            ],
            "title": "Parameters"
          }
        },
        "required": [
          "criterion_id",
          "kind"
        ],
        "title": "MissionTestCriterion",
        "type": "object"
      },
      "MissionIsolatedTestParameters": {
        "additionalProperties": false,
        "properties": {
          "adapter": {
            "const": "isolated_python_v1",
            "title": "Adapter",
            "type": "string"
          },
          "code": {
            "maxLength": 8192,
            "minLength": 1,
            "title": "Code",
            "type": "string"
          },
          "code_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Code Sha256",
            "type": "string"
          }
        },
        "required": [
          "adapter",
          "code",
          "code_sha256"
        ],
        "title": "MissionIsolatedTestParameters",
        "type": "object"
      },
      "MissionTestParameters": {
        "additionalProperties": false,
        "properties": {
          "command": {
            "anyOf": [
              {
                "maxLength": 4096,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Command"
          },
          "evidence_ref": {
            "anyOf": [
              {
                "maxLength": 1024,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Evidence Ref"
          }
        },
        "title": "MissionTestParameters",
        "type": "object"
      },
      "MissionUserCriterion": {
        "additionalProperties": false,
        "properties": {
          "criterion_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Criterion Id",
            "type": "string"
          },
          "description": {
            "default": "",
            "maxLength": 4096,
            "title": "Description",
            "type": "string"
          },
          "artifact_refs": {
            "items": {
              "$ref": "#/components/schemas/MissionArtifactRef"
            },
            "maxItems": 16,
            "title": "Artifact Refs",
            "type": "array"
          },
          "required": {
            "default": true,
            "title": "Required",
            "type": "boolean"
          },
          "kind": {
            "const": "user_acceptance",
            "title": "Kind",
            "type": "string"
          },
          "parameters": {
            "$ref": "#/components/schemas/MissionEmptyParameters"
          }
        },
        "required": [
          "criterion_id",
          "kind"
        ],
        "title": "MissionUserCriterion",
        "type": "object"
      },
      "MissionEmptyParameters": {
        "additionalProperties": false,
        "properties": {},
        "title": "MissionEmptyParameters",
        "type": "object"
      },
      "MissionDependency": {
        "additionalProperties": false,
        "properties": {
          "dependency_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Dependency Id",
            "type": "string"
          },
          "kind": {
            "enum": [
              "artifact",
              "evidence",
              "input",
              "mission"
            ],
            "title": "Kind",
            "type": "string"
          },
          "reference": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Reference",
            "type": "string"
          },
          "version": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Version"
          },
          "digest": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Digest"
          },
          "status": {
            "anyOf": [
              {
                "maxLength": 128,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Status"
          }
        },
        "required": [
          "dependency_id",
          "kind",
          "reference"
        ],
        "title": "MissionDependency",
        "type": "object"
      },
      "MissionPlanStep": {
        "additionalProperties": false,
        "properties": {
          "step_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Step Id",
            "type": "string"
          },
          "description": {
            "default": "",
            "maxLength": 4096,
            "title": "Description",
            "type": "string"
          },
          "status": {
            "default": "pending",
            "enum": [
              "pending",
              "working",
              "completed",
              "blocked",
              "skipped"
            ],
            "title": "Status",
            "type": "string"
          },
          "checkpoint": {
            "default": false,
            "title": "Checkpoint",
            "type": "boolean"
          },
          "depends_on": {
            "items": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "maxItems": 100,
            "title": "Depends On",
            "type": "array"
          },
          "input_digests": {
            "items": {
              "pattern": "^[0-9a-f]{64}$",
              "type": "string"
            },
            "maxItems": 100,
            "title": "Input Digests",
            "type": "array"
          },
          "target_refs": {
            "items": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "maxItems": 100,
            "title": "Target Refs",
            "type": "array"
          },
          "approval_ids": {
            "items": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "maxItems": 100,
            "title": "Approval Ids",
            "type": "array"
          }
        },
        "required": [
          "step_id"
        ],
        "title": "MissionPlanStep",
        "type": "object"
      },
      "MissionLegacyContract": {
        "additionalProperties": false,
        "properties": {
          "outcome": {
            "default": "",
            "maxLength": 4096,
            "title": "Outcome",
            "type": "string"
          },
          "verification": {
            "default": "",
            "maxLength": 4096,
            "title": "Verification",
            "type": "string"
          },
          "constraints": {
            "default": "",
            "maxLength": 4096,
            "title": "Constraints",
            "type": "string"
          },
          "boundaries": {
            "default": "",
            "maxLength": 4096,
            "title": "Boundaries",
            "type": "string"
          },
          "stop_when": {
            "default": "",
            "maxLength": 4096,
            "title": "Stop When",
            "type": "string"
          }
        },
        "title": "MissionLegacyContract",
        "type": "object"
      },
      "MissionHistoricalGate": {
        "additionalProperties": false,
        "properties": {
          "command": {
            "maxLength": 4096,
            "title": "Command",
            "type": "string"
          },
          "timeout_seconds": {
            "default": 300,
            "maximum": 3600,
            "minimum": 1,
            "title": "Timeout Seconds",
            "type": "integer"
          },
          "max_retries": {
            "default": 3,
            "maximum": 10,
            "minimum": 0,
            "title": "Max Retries",
            "type": "integer"
          }
        },
        "required": [
          "command"
        ],
        "title": "MissionHistoricalGate",
        "type": "object"
      },
      "MissionEffectRef": {
        "additionalProperties": false,
        "properties": {
          "effect_id": {
            "title": "Effect Id",
            "type": "string"
          },
          "state": {
            "enum": [
              "prepared",
              "dispatched",
              "confirmed",
              "failed",
              "outcome_unknown",
              "reconciliation_required"
            ],
            "title": "State",
            "type": "string"
          }
        },
        "required": [
          "effect_id",
          "state"
        ],
        "title": "MissionEffectRef",
        "type": "object"
      },
      "MissionDeliveryRef": {
        "additionalProperties": false,
        "properties": {
          "delivery_id": {
            "title": "Delivery Id",
            "type": "string"
          },
          "state": {
            "title": "State",
            "type": "string"
          }
        },
        "required": [
          "delivery_id",
          "state"
        ],
        "title": "MissionDeliveryRef",
        "type": "object"
      },
      "MissionMissedSteer": {
        "additionalProperties": false,
        "properties": {
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "run_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Run Id"
          },
          "effect_ids": {
            "items": {
              "type": "string"
            },
            "title": "Effect Ids",
            "type": "array"
          },
          "reason": {
            "enum": [
              "effect_already_dispatched",
              "turn_already_finalizing"
            ],
            "title": "Reason",
            "type": "string"
          }
        },
        "required": [
          "revision",
          "effect_ids",
          "reason"
        ],
        "title": "MissionMissedSteer",
        "type": "object"
      },
      "MissionGetParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "mission_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Mission Id"
          }
        },
        "required": [
          "session_id",
          "schema_version"
        ],
        "title": "MissionGetParams",
        "type": "object"
      },
      "MissionGetResult": {
        "additionalProperties": false,
        "properties": {
          "mission": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/MissionRecord"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "mission"
        ],
        "title": "MissionGetResult",
        "type": "object"
      },
      "MissionListParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "limit": {
            "default": 100,
            "maximum": 100,
            "minimum": 1,
            "title": "Limit",
            "type": "integer"
          }
        },
        "required": [
          "session_id",
          "schema_version"
        ],
        "title": "MissionListParams",
        "type": "object"
      },
      "MissionListResult": {
        "additionalProperties": false,
        "properties": {
          "missions": {
            "items": {
              "$ref": "#/components/schemas/MissionRecord"
            },
            "title": "Missions",
            "type": "array"
          },
          "limit": {
            "title": "Limit",
            "type": "integer"
          },
          "limit_reached": {
            "title": "Limit Reached",
            "type": "boolean"
          },
          "complete": {
            "const": false,
            "title": "Complete",
            "type": "boolean"
          }
        },
        "required": [
          "missions",
          "limit",
          "limit_reached",
          "complete"
        ],
        "title": "MissionListResult",
        "type": "object"
      },
      "RuntimeProjectParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "project_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Project Id",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id"
        ],
        "title": "RuntimeProjectParams",
        "type": "object"
      },
      "RuntimeProjectResult": {
        "additionalProperties": false,
        "properties": {
          "project": {
            "$ref": "#/components/schemas/RuntimeProjectRecord"
          }
        },
        "required": [
          "project"
        ],
        "title": "RuntimeProjectResult",
        "type": "object"
      },
      "RuntimeProjectRecord": {
        "additionalProperties": false,
        "properties": {
          "id": {
            "title": "Id",
            "type": "string"
          },
          "project_id": {
            "title": "Project Id",
            "type": "string"
          },
          "slug": {
            "title": "Slug",
            "type": "string"
          },
          "name": {
            "title": "Name",
            "type": "string"
          },
          "description": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Description"
          },
          "icon": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Icon"
          },
          "color": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Color"
          },
          "board_slug": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Board Slug"
          },
          "primary_path": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Primary Path"
          },
          "archived": {
            "title": "Archived",
            "type": "boolean"
          },
          "created_at": {
            "title": "Created At",
            "type": "integer"
          },
          "folders": {
            "items": {
              "$ref": "#/components/schemas/RuntimeProjectFolder"
            },
            "title": "Folders",
            "type": "array"
          },
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "owner_principal_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Owner Principal Id"
          },
          "purpose": {
            "title": "Purpose",
            "type": "string"
          },
          "source_refs": {
            "items": {
              "$ref": "#/components/schemas/ProjectSourceRef"
            },
            "title": "Source Refs",
            "type": "array"
          },
          "canonical_artifact_refs": {
            "items": {
              "$ref": "#/components/schemas/ArtifactVersionRef"
            },
            "title": "Canonical Artifact Refs",
            "type": "array"
          },
          "active_mission_refs": {
            "items": {
              "$ref": "#/components/schemas/ProjectMissionRef"
            },
            "title": "Active Mission Refs",
            "type": "array"
          },
          "grants": {
            "items": {
              "$ref": "#/components/schemas/ProjectGrant"
            },
            "title": "Grants",
            "type": "array"
          }
        },
        "required": [
          "id",
          "project_id",
          "slug",
          "name",
          "description",
          "icon",
          "color",
          "board_slug",
          "primary_path",
          "archived",
          "created_at",
          "folders",
          "revision",
          "owner_principal_id",
          "purpose",
          "source_refs",
          "canonical_artifact_refs",
          "active_mission_refs",
          "grants"
        ],
        "title": "RuntimeProjectRecord",
        "type": "object"
      },
      "RuntimeProjectFolder": {
        "additionalProperties": false,
        "properties": {
          "path": {
            "title": "Path",
            "type": "string"
          },
          "label": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Label"
          },
          "is_primary": {
            "title": "Is Primary",
            "type": "boolean"
          },
          "added_at": {
            "title": "Added At",
            "type": "integer"
          }
        },
        "required": [
          "path",
          "label",
          "is_primary",
          "added_at"
        ],
        "title": "RuntimeProjectFolder",
        "type": "object"
      },
      "ProjectSourceRef": {
        "additionalProperties": false,
        "properties": {
          "capture_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Capture Id",
            "type": "string"
          }
        },
        "required": [
          "capture_id"
        ],
        "title": "ProjectSourceRef",
        "type": "object"
      },
      "ArtifactVersionRef": {
        "additionalProperties": false,
        "properties": {
          "artifact_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Artifact Id",
            "type": "string"
          },
          "version": {
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          }
        },
        "required": [
          "artifact_id",
          "version"
        ],
        "title": "ArtifactVersionRef",
        "type": "object"
      },
      "ProjectMissionRef": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "run_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Run Id",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "run_id"
        ],
        "title": "ProjectMissionRef",
        "type": "object"
      },
      "ProjectGrant": {
        "additionalProperties": false,
        "properties": {
          "principal_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Principal Id",
            "type": "string"
          },
          "agent_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Agent Id",
            "type": "string"
          },
          "permissions": {
            "items": {
              "enum": [
                "read",
                "write",
                "share"
              ],
              "type": "string"
            },
            "maxItems": 3,
            "minItems": 1,
            "title": "Permissions",
            "type": "array"
          }
        },
        "required": [
          "principal_id",
          "agent_id",
          "permissions"
        ],
        "title": "ProjectGrant",
        "type": "object"
      },
      "RuntimeResultGetParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "offset": {
            "default": 0,
            "minimum": 0,
            "title": "Offset",
            "type": "integer"
          },
          "limit": {
            "default": 65536,
            "maximum": 65536,
            "minimum": 1,
            "title": "Limit",
            "type": "integer"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "command_id"
        ],
        "title": "RuntimeResultGetParams",
        "type": "object"
      },
      "RuntimeResultChunk": {
        "additionalProperties": false,
        "properties": {
          "command_id": {
            "title": "Command Id",
            "type": "string"
          },
          "artifact_id": {
            "title": "Artifact Id",
            "type": "string"
          },
          "version": {
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "size": {
            "minimum": 0,
            "title": "Size",
            "type": "integer"
          },
          "mime": {
            "title": "Mime",
            "type": "string"
          },
          "offset": {
            "title": "Offset",
            "type": "integer"
          },
          "data_base64": {
            "title": "Data Base64",
            "type": "string"
          },
          "next_offset": {
            "title": "Next Offset",
            "type": "integer"
          },
          "eof": {
            "title": "Eof",
            "type": "boolean"
          },
          "publication_state": {
            "enum": [
              "committed",
              "published_uncommitted"
            ],
            "title": "Publication State",
            "type": "string"
          },
          "delivery_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Delivery Id"
          }
        },
        "required": [
          "command_id",
          "artifact_id",
          "version",
          "sha256",
          "size",
          "mime",
          "offset",
          "data_base64",
          "next_offset",
          "eof",
          "publication_state",
          "delivery_id"
        ],
        "title": "RuntimeResultChunk",
        "type": "object"
      },
      "RuntimeSessionParams": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Session Id",
            "type": "string"
          },
          "schema_version": {
            "const": 1,
            "title": "Schema Version",
            "type": "integer"
          }
        },
        "required": [
          "session_id",
          "schema_version"
        ],
        "title": "RuntimeSessionParams",
        "type": "object"
      },
      "DotsApprovalRequest": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "title": "Session Id",
            "type": "string"
          },
          "authority": {
            "$ref": "#/components/schemas/DotsReadAuthority"
          },
          "approval_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Approval Id",
            "type": "string"
          },
          "approval_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Approval Digest",
            "type": "string"
          },
          "action_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Action Digest",
            "type": "string"
          },
          "expires_at": {
            "title": "Expires At",
            "type": "number"
          }
        },
        "required": [
          "session_id",
          "authority",
          "approval_id",
          "approval_digest",
          "action_digest",
          "expires_at"
        ],
        "title": "DotsApprovalRequest",
        "type": "object"
      },
      "DotsReadAuthority": {
        "additionalProperties": false,
        "properties": {
          "principal_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Principal Id",
            "type": "string"
          },
          "profile_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Profile Id",
            "type": "string"
          },
          "agent_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Agent Id",
            "type": "string"
          },
          "runtime_session_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Runtime Session Id",
            "type": "string"
          },
          "run_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Run Id",
            "type": "string"
          },
          "policy_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Policy Digest",
            "type": "string"
          },
          "generation": {
            "minimum": 0,
            "title": "Generation",
            "type": "integer"
          }
        },
        "required": [
          "principal_id",
          "profile_id",
          "agent_id",
          "runtime_session_id",
          "run_id",
          "policy_digest",
          "generation"
        ],
        "title": "DotsReadAuthority",
        "type": "object"
      },
      "DotsApprovalResult": {
        "additionalProperties": false,
        "properties": {
          "approval_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Approval Id",
            "type": "string"
          },
          "approval_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Approval Digest",
            "type": "string"
          },
          "choice": {
            "enum": [
              "once",
              "deny"
            ],
            "title": "Choice",
            "type": "string"
          }
        },
        "required": [
          "approval_id",
          "approval_digest",
          "choice"
        ],
        "title": "DotsApprovalResult",
        "type": "object"
      },
      "DotsDispatchRequest": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "title": "Session Id",
            "type": "string"
          },
          "identity": {
            "$ref": "#/components/schemas/DotsEffectIdentity"
          },
          "proposal": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/DotsPageProposal"
              },
              {
                "$ref": "#/components/schemas/DotsComputerProposal"
              }
            ],
            "title": "Proposal"
          },
          "content_json": {
            "maxLength": 65536,
            "title": "Content Json",
            "type": "string"
          },
          "deadline_at": {
            "title": "Deadline At",
            "type": "number"
          }
        },
        "required": [
          "session_id",
          "identity",
          "proposal",
          "content_json",
          "deadline_at"
        ],
        "title": "DotsDispatchRequest",
        "type": "object"
      },
      "DotsComputerProposal": {
        "additionalProperties": false,
        "properties": {
          "kind": {
            "const": "computer",
            "default": "computer",
            "title": "Kind",
            "type": "string"
          },
          "executor_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Executor Id",
            "type": "string"
          },
          "expected_grant_revision": {
            "minimum": 0,
            "title": "Expected Grant Revision",
            "type": "integer"
          },
          "expected_control_revision": {
            "minimum": 0,
            "title": "Expected Control Revision",
            "type": "integer"
          },
          "snapshot_id": {
            "minimum": 0,
            "title": "Snapshot Id",
            "type": "integer"
          },
          "snapshot_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Snapshot Sha256",
            "type": "string"
          },
          "action": {
            "enum": [
              "navigate",
              "read",
              "snapshot",
              "screenshot",
              "click",
              "type",
              "key",
              "scroll",
              "files_list",
              "files_read",
              "files_write",
              "exec"
            ],
            "title": "Action",
            "type": "string"
          },
          "input": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/DotsEmptyInput"
              },
              {
                "$ref": "#/components/schemas/DotsNavigateInput"
              },
              {
                "$ref": "#/components/schemas/DotsClickInput"
              },
              {
                "$ref": "#/components/schemas/DotsTypeInput"
              },
              {
                "$ref": "#/components/schemas/DotsKeyInput"
              },
              {
                "$ref": "#/components/schemas/DotsScrollInput"
              },
              {
                "$ref": "#/components/schemas/DotsFilesListInput"
              },
              {
                "$ref": "#/components/schemas/DotsFilesReadInput"
              },
              {
                "$ref": "#/components/schemas/DotsFilesWriteInput"
              },
              {
                "$ref": "#/components/schemas/DotsExecInput"
              }
            ],
            "title": "Input"
          }
        },
        "required": [
          "executor_id",
          "expected_grant_revision",
          "expected_control_revision",
          "snapshot_id",
          "snapshot_sha256",
          "action",
          "input"
        ],
        "title": "DotsComputerProposal",
        "type": "object"
      },
      "DotsEmptyInput": {
        "additionalProperties": false,
        "properties": {},
        "title": "DotsEmptyInput",
        "type": "object"
      },
      "DotsNavigateInput": {
        "additionalProperties": false,
        "properties": {
          "url": {
            "maxLength": 2048,
            "minLength": 1,
            "title": "Url",
            "type": "string"
          }
        },
        "required": [
          "url"
        ],
        "title": "DotsNavigateInput",
        "type": "object"
      },
      "DotsClickInput": {
        "additionalProperties": false,
        "properties": {
          "ref": {
            "maxLength": 100,
            "minLength": 1,
            "title": "Ref",
            "type": "string"
          },
          "snapshotId": {
            "minimum": 0,
            "title": "Snapshotid",
            "type": "integer"
          }
        },
        "required": [
          "ref",
          "snapshotId"
        ],
        "title": "DotsClickInput",
        "type": "object"
      },
      "DotsTypeInput": {
        "additionalProperties": false,
        "properties": {
          "ref": {
            "maxLength": 100,
            "minLength": 1,
            "title": "Ref",
            "type": "string"
          },
          "snapshotId": {
            "minimum": 0,
            "title": "Snapshotid",
            "type": "integer"
          },
          "text": {
            "maxLength": 16000,
            "title": "Text",
            "type": "string"
          },
          "submit": {
            "default": false,
            "title": "Submit",
            "type": "boolean"
          }
        },
        "required": [
          "ref",
          "snapshotId",
          "text"
        ],
        "title": "DotsTypeInput",
        "type": "object"
      },
      "DotsKeyInput": {
        "additionalProperties": false,
        "properties": {
          "key": {
            "maxLength": 100,
            "minLength": 1,
            "title": "Key",
            "type": "string"
          }
        },
        "required": [
          "key"
        ],
        "title": "DotsKeyInput",
        "type": "object"
      },
      "DotsScrollInput": {
        "additionalProperties": false,
        "properties": {
          "deltaY": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "number"
              }
            ],
            "ge": -10000,
            "le": 10000,
            "title": "Deltay"
          }
        },
        "required": [
          "deltaY"
        ],
        "title": "DotsScrollInput",
        "type": "object"
      },
      "DotsFilesListInput": {
        "additionalProperties": false,
        "properties": {
          "path": {
            "default": "",
            "maxLength": 1024,
            "title": "Path",
            "type": "string"
          }
        },
        "title": "DotsFilesListInput",
        "type": "object"
      },
      "DotsFilesReadInput": {
        "additionalProperties": false,
        "properties": {
          "path": {
            "maxLength": 1024,
            "minLength": 1,
            "title": "Path",
            "type": "string"
          }
        },
        "required": [
          "path"
        ],
        "title": "DotsFilesReadInput",
        "type": "object"
      },
      "DotsFilesWriteInput": {
        "additionalProperties": false,
        "properties": {
          "path": {
            "maxLength": 1024,
            "minLength": 1,
            "title": "Path",
            "type": "string"
          },
          "contents": {
            "maxLength": 24000,
            "title": "Contents",
            "type": "string"
          },
          "append": {
            "default": false,
            "title": "Append",
            "type": "boolean"
          }
        },
        "required": [
          "path",
          "contents"
        ],
        "title": "DotsFilesWriteInput",
        "type": "object"
      },
      "DotsExecInput": {
        "additionalProperties": false,
        "properties": {
          "command": {
            "maxLength": 8000,
            "minLength": 1,
            "title": "Command",
            "type": "string"
          },
          "timeoutMs": {
            "default": 30000,
            "maximum": 60000,
            "minimum": 1000,
            "title": "Timeoutms",
            "type": "integer"
          }
        },
        "required": [
          "command"
        ],
        "title": "DotsExecInput",
        "type": "object"
      },
      "DotsInspectRequest": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "title": "Session Id",
            "type": "string"
          },
          "identity": {
            "$ref": "#/components/schemas/DotsEffectIdentity"
          },
          "deadline_at": {
            "title": "Deadline At",
            "type": "number"
          }
        },
        "required": [
          "session_id",
          "identity",
          "deadline_at"
        ],
        "title": "DotsInspectRequest",
        "type": "object"
      },
      "DotsPageReadRequest": {
        "additionalProperties": false,
        "properties": {
          "session_id": {
            "title": "Session Id",
            "type": "string"
          },
          "authority": {
            "$ref": "#/components/schemas/DotsReadAuthority"
          },
          "scope": {
            "$ref": "#/components/schemas/DotsPageReadScope"
          },
          "deadline_at": {
            "title": "Deadline At",
            "type": "number"
          }
        },
        "required": [
          "session_id",
          "authority",
          "scope",
          "deadline_at"
        ],
        "title": "DotsPageReadRequest",
        "type": "object"
      },
      "DotsPageReadScope": {
        "additionalProperties": false,
        "properties": {
          "store_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Store Id",
            "type": "string"
          },
          "project_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Project Id",
            "type": "string"
          },
          "space_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Space Id",
            "type": "string"
          },
          "page_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Page Id",
            "type": "string"
          },
          "expected_grant_revision": {
            "minimum": 0,
            "title": "Expected Grant Revision",
            "type": "integer"
          },
          "version": {
            "anyOf": [
              {
                "minimum": 1,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Version"
          }
        },
        "required": [
          "store_id",
          "project_id",
          "space_id",
          "page_id",
          "expected_grant_revision"
        ],
        "title": "DotsPageReadScope",
        "type": "object"
      },
      "DotsPageReadResult": {
        "additionalProperties": false,
        "properties": {
          "authority": {
            "$ref": "#/components/schemas/DotsReadAuthority"
          },
          "scope": {
            "$ref": "#/components/schemas/DotsPageReadScope"
          },
          "version": {
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "content_json": {
            "maxLength": 65536,
            "title": "Content Json",
            "type": "string"
          },
          "content_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Content Sha256",
            "type": "string"
          }
        },
        "required": [
          "authority",
          "scope",
          "version",
          "content_json",
          "content_sha256"
        ],
        "title": "DotsPageReadResult",
        "type": "object"
      },
      "RequestCancelPayload": {
        "additionalProperties": false,
        "properties": {
          "id": {
            "title": "Id",
            "type": "string"
          },
          "method": {
            "title": "Method",
            "type": "string"
          },
          "reason": {
            "title": "Reason",
            "type": "string"
          }
        },
        "required": [
          "id",
          "method",
          "reason"
        ],
        "title": "RequestCancelPayload",
        "type": "object"
      }
    }
  }
};
