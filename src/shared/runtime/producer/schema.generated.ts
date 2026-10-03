// GENERATED exact subset of pinned producer. DO NOT EDIT.
// Regenerate: node scripts/pin-producer-contract.mjs /path/to/ryoko-agent
export const producerSchema = {
  "methods": [
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
  "components": {
    "schemas": {
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
      }
    }
  }
};
