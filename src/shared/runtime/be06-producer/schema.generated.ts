// GENERATED exact subset of pinned producer. DO NOT EDIT.
// Regenerate: node scripts/pin-be06-contract.mjs /path/to/ryoko-agent
export const producerSchema = {
  "methods": [
    {
      "name": "runtime.agent.archive",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/AgentConfigurationArchiveParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/AgentConfigurationResult"
        }
      }
    },
    {
      "name": "runtime.agent.create",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/AgentConfigurationCreateParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/AgentConfigurationResult"
        }
      }
    },
    {
      "name": "runtime.agent.get",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/AgentConfigurationParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/AgentConfigurationResult"
        }
      }
    },
    {
      "name": "runtime.agent.list",
      "summary": "",
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
          "$ref": "#/components/schemas/AgentConfigurationList"
        }
      }
    },
    {
      "name": "runtime.agent.session.get",
      "summary": "Inspect current-session frozen revisions and desired workflow pins without changing prompts or granting execution.",
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
          "$ref": "#/components/schemas/AgentSessionConfiguration"
        }
      }
    },
    {
      "name": "runtime.agent.update",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/AgentConfigurationUpdateParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/AgentConfigurationResult"
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
      "name": "runtime.artifact.cancel",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/ArtifactCommandParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/ArtifactControlStatus"
        }
      }
    },
    {
      "name": "runtime.artifact.get",
      "summary": "Read complete immutable bytes in bounded chunks; render only as plain text.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/ArtifactReadParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/ArtifactReadResult"
        }
      }
    },
    {
      "name": "runtime.artifact.status",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/ArtifactCommandParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/ArtifactControlStatus"
        }
      }
    },
    {
      "name": "runtime.evidence.create",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/EvidenceCreateParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/EvidenceResult"
        }
      }
    },
    {
      "name": "runtime.evidence.get",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/EvidenceParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/EvidenceResult"
        }
      }
    },
    {
      "name": "runtime.evidence.list",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/SourceListParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/EvidenceListResult"
        }
      }
    },
    {
      "name": "runtime.memory.export",
      "summary": "Read a revision-bound local structured export in bounded chunks; no remote sharing.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MemoryExportParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MemoryExportResult"
        }
      }
    },
    {
      "name": "runtime.memory.record.delete",
      "summary": "Tombstone one exact built-in record version; this is not physical erasure of backups.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MemoryDeleteParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MemoryMutationResult"
        }
      }
    },
    {
      "name": "runtime.memory.record.get",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MemoryRecordParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MemoryRecordResult"
        }
      }
    },
    {
      "name": "runtime.memory.record.write",
      "summary": "Compare-and-swap one owner-bound built-in record; never falls back from personal MCP.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MemoryWriteParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MemoryMutationResult"
        }
      }
    },
    {
      "name": "runtime.memory.records.list",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MemoryListParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MemoryListResult"
        }
      }
    },
    {
      "name": "runtime.memory.scope.set",
      "summary": "Select an explicitly granted project for fresh built-in memory context; never rewrites the frozen prefix.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MemoryScopeParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/MemoryScopeResult"
        }
      }
    },
    {
      "name": "runtime.memory.status",
      "summary": "Inspect the owned agent's single routed memory backend without recall or fallback.",
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
          "$ref": "#/components/schemas/MemoryStatusResult"
        }
      }
    },
    {
      "name": "runtime.mission.create",
      "summary": "Create bounded mission intent under an owned user control; never dispatch or reset a budget.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/MissionCreateParams"
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
      "name": "runtime.project.grants.set",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/RuntimeProjectGrantsParams"
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
      "name": "runtime.specialist.catalog",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/SpecialistProjectParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/SpecialistCatalog"
        }
      }
    },
    {
      "name": "runtime.specialist.handoff",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/SpecialistHandoffParams"
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
      "name": "runtime.specialist.preview",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/SpecialistPreviewParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/SpecialistPreview"
        }
      }
    },
    {
      "name": "runtime.specialist.status",
      "summary": "",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/SpecialistStatusParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/SpecialistStatus"
        }
      }
    },
    {
      "name": "runtime.workflow.create",
      "summary": "Create an immutable draft with scoped accepted-work or consent evidence; never promote or execute it.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowCreateParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowResult"
        }
      }
    },
    {
      "name": "runtime.workflow.decision.commit",
      "summary": "Commit the exact reviewed human workflow decision; no skill self-promotion.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowDecisionCommitParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowDecisionResult"
        }
      }
    },
    {
      "name": "runtime.workflow.decision.prepare",
      "summary": "Prepare exact lifecycle/pointer/sharing approval bound to content, evaluation, destination and current policy.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowDecisionParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowDecisionPrepareResult"
        }
      }
    },
    {
      "name": "runtime.workflow.delivery.commit",
      "summary": "Install the exact reviewed immutable specialist pin with compare-and-swap; rollback selects an earlier delivered approved version.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowDeliveryCommitParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowDeliveryCommitResult"
        }
      }
    },
    {
      "name": "runtime.workflow.delivery.list",
      "summary": "List current workflow pins for one owned specialist and project; installation grants no tool or personal-memory authority.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowDeliveryListParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowDeliveryListResult"
        }
      }
    },
    {
      "name": "runtime.workflow.delivery.prepare",
      "summary": "Review exact approved workflow bytes and a named stable specialist before installing advisory knowledge next session.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowDeliveryParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowDeliveryPrepareResult"
        }
      }
    },
    {
      "name": "runtime.workflow.evaluate",
      "summary": "Evaluate bounded local producers on varied tuning and held-out cases against recorded baseline outputs; never execute external effects.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowEvaluateParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowEvaluateResult"
        }
      }
    },
    {
      "name": "runtime.workflow.feedback",
      "summary": "Retain corrections or failure evidence as references without training or silently modifying instructions.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowFeedbackParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowEvidenceResult"
        }
      }
    },
    {
      "name": "runtime.workflow.get",
      "summary": "Read an exact granted canonical workflow version and its lifecycle.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowVersionParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowResult"
        }
      }
    },
    {
      "name": "runtime.workflow.list",
      "summary": "Discover explicitly project-granted workflows without reading personal memory.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowProjectParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowListResult"
        }
      }
    },
    {
      "name": "runtime.workflow.run.prepare",
      "summary": "Execute a finite local workflow pinned to immutable content, parameters, template, budget and exact ready Mission; prepare outputs.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowRunParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowRunPrepareResult"
        }
      }
    },
    {
      "name": "runtime.workflow.run.publish",
      "summary": "Publish only exactly approved prepared outputs through existing artifact effects; mission completion remains separately verified.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowRunPublishParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowRunPublishResult"
        }
      }
    },
    {
      "name": "runtime.workflow.runs",
      "summary": "Inspect owned run pins and output history; never resume by resolving a changed active pointer.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowVersionParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowHistoryResult"
        }
      }
    },
    {
      "name": "runtime.workflow.template.create",
      "summary": "Create a separate immutable style template; existing workflow pins and deliverables remain unchanged.",
      "params": [
        {
          "name": "params",
          "schema": {
            "$ref": "#/components/schemas/WorkflowCreateParams"
          }
        }
      ],
      "result": {
        "name": "result",
        "schema": {
          "$ref": "#/components/schemas/WorkflowTemplateResult"
        }
      }
    }
  ],
  "components": {
    "schemas": {
      "AgentConfigurationArchiveParams": {
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
          "agent_id": {
            "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$",
            "title": "Agent Id",
            "type": "string"
          },
          "expected_revision": {
            "minimum": 1,
            "title": "Expected Revision",
            "type": "integer"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "agent_id",
          "expected_revision"
        ],
        "title": "AgentConfigurationArchiveParams",
        "type": "object"
      },
      "AgentConfigurationResult": {
        "additionalProperties": false,
        "properties": {
          "agent": {
            "$ref": "#/components/schemas/AgentConfigurationRecord"
          }
        },
        "required": [
          "agent"
        ],
        "title": "AgentConfigurationResult",
        "type": "object"
      },
      "AgentConfigurationRecord": {
        "additionalProperties": false,
        "properties": {
          "agent_id": {
            "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$",
            "title": "Agent Id",
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
          },
          "builtin_memory_namespace": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Builtin Memory Namespace"
          },
          "config": {
            "$ref": "#/components/schemas/AgentEditableConfig"
          },
          "revision": {
            "minimum": 1,
            "title": "Revision",
            "type": "integer"
          },
          "archived": {
            "title": "Archived",
            "type": "boolean"
          },
          "active_session_revision": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Active Session Revision"
          },
          "authority_revocation_revision": {
            "minimum": 0,
            "title": "Authority Revocation Revision",
            "type": "integer"
          },
          "active_session_revision_revoked": {
            "title": "Active Session Revision Revoked",
            "type": "boolean"
          },
          "activation": {
            "const": "next_session",
            "default": "next_session",
            "title": "Activation",
            "type": "string"
          },
          "personal_memory_mutation_supported": {
            "const": false,
            "default": false,
            "title": "Personal Memory Mutation Supported",
            "type": "boolean"
          }
        },
        "required": [
          "agent_id",
          "role",
          "memory_backend",
          "builtin_memory_namespace",
          "config",
          "revision",
          "archived",
          "active_session_revision",
          "authority_revocation_revision",
          "active_session_revision_revoked"
        ],
        "title": "AgentConfigurationRecord",
        "type": "object"
      },
      "AgentEditableConfig": {
        "additionalProperties": false,
        "properties": {
          "name": {
            "maxLength": 200,
            "minLength": 1,
            "title": "Name",
            "type": "string"
          },
          "instructions": {
            "default": "",
            "maxLength": 20000,
            "title": "Instructions",
            "type": "string"
          },
          "research_allowed": {
            "default": true,
            "title": "Research Allowed",
            "type": "boolean"
          },
          "memory_allowed": {
            "default": true,
            "title": "Memory Allowed",
            "type": "boolean"
          },
          "project_grants": {
            "items": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "maxItems": 100,
            "title": "Project Grants",
            "type": "array"
          },
          "default_project_id": {
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
            "title": "Default Project Id"
          }
        },
        "required": [
          "name"
        ],
        "title": "AgentEditableConfig",
        "type": "object"
      },
      "AgentConfigurationCreateParams": {
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
          "copy_from_agent_id": {
            "anyOf": [
              {
                "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Copy From Agent Id"
          },
          "config": {
            "$ref": "#/components/schemas/AgentEditableConfig"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "config"
        ],
        "title": "AgentConfigurationCreateParams",
        "type": "object"
      },
      "AgentConfigurationParams": {
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
          "agent_id": {
            "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$",
            "title": "Agent Id",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "agent_id"
        ],
        "title": "AgentConfigurationParams",
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
      "AgentConfigurationList": {
        "additionalProperties": false,
        "properties": {
          "agents": {
            "items": {
              "$ref": "#/components/schemas/AgentConfigurationRecord"
            },
            "title": "Agents",
            "type": "array"
          },
          "activation": {
            "const": "next_session",
            "default": "next_session",
            "title": "Activation",
            "type": "string"
          }
        },
        "required": [
          "agents"
        ],
        "title": "AgentConfigurationList",
        "type": "object"
      },
      "AgentSessionConfiguration": {
        "additionalProperties": false,
        "properties": {
          "agent_id": {
            "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$",
            "title": "Agent Id",
            "type": "string"
          },
          "role": {
            "enum": [
              "primary",
              "specialist",
              "child"
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
          },
          "active_configuration_revision": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Active Configuration Revision"
          },
          "desired_configuration_revision": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Desired Configuration Revision"
          },
          "archived": {
            "title": "Archived",
            "type": "boolean"
          },
          "authority_revocation_revision": {
            "title": "Authority Revocation Revision",
            "type": "integer"
          },
          "authority_current": {
            "title": "Authority Current",
            "type": "boolean"
          },
          "revocation_code": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Revocation Code"
          },
          "startup_frozen": {
            "title": "Startup Frozen",
            "type": "boolean"
          },
          "active_workflows": {
            "items": {
              "$ref": "#/components/schemas/AgentSessionWorkflowPin"
            },
            "title": "Active Workflows",
            "type": "array"
          },
          "desired_workflows": {
            "items": {
              "$ref": "#/components/schemas/AgentSessionWorkflowPin"
            },
            "title": "Desired Workflows",
            "type": "array"
          },
          "activation": {
            "const": "next_session",
            "title": "Activation",
            "type": "string"
          },
          "execution_authority": {
            "const": false,
            "title": "Execution Authority",
            "type": "boolean"
          }
        },
        "required": [
          "agent_id",
          "role",
          "memory_backend",
          "active_configuration_revision",
          "desired_configuration_revision",
          "archived",
          "authority_revocation_revision",
          "authority_current",
          "revocation_code",
          "startup_frozen",
          "active_workflows",
          "desired_workflows",
          "activation",
          "execution_authority"
        ],
        "title": "AgentSessionConfiguration",
        "type": "object"
      },
      "AgentSessionWorkflowPin": {
        "additionalProperties": false,
        "properties": {
          "project_id": {
            "title": "Project Id",
            "type": "string"
          },
          "workflow_id": {
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "sha256": {
            "pattern": "^[a-f0-9]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "delivery_revision": {
            "minimum": 1,
            "title": "Delivery Revision",
            "type": "integer"
          },
          "workflow_state": {
            "enum": [
              "draft",
              "tested",
              "approved",
              "deprecated",
              "revoked",
              "unavailable"
            ],
            "title": "Workflow State",
            "type": "string"
          }
        },
        "required": [
          "project_id",
          "workflow_id",
          "version",
          "sha256",
          "delivery_revision",
          "workflow_state"
        ],
        "title": "AgentSessionWorkflowPin",
        "type": "object"
      },
      "AgentConfigurationUpdateParams": {
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
          "agent_id": {
            "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$",
            "title": "Agent Id",
            "type": "string"
          },
          "expected_revision": {
            "minimum": 1,
            "title": "Expected Revision",
            "type": "integer"
          },
          "config": {
            "$ref": "#/components/schemas/AgentEditableConfig"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "agent_id",
          "expected_revision",
          "config"
        ],
        "title": "AgentConfigurationUpdateParams",
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
      "ArtifactCommandParams": {
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
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "command_id"
        ],
        "title": "ArtifactCommandParams",
        "type": "object"
      },
      "ArtifactControlStatus": {
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
          "status": {
            "enum": [
              "accepted",
              "claimed",
              "completed",
              "cancelled",
              "failed",
              "blocked"
            ],
            "title": "Status",
            "type": "string"
          },
          "owner_live": {
            "title": "Owner Live",
            "type": "boolean"
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
            "title": "Expires At"
          },
          "result": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ArtifactPublishResult"
              },
              {
                "$ref": "#/components/schemas/ArtifactCancelledResult"
              },
              {
                "$ref": "#/components/schemas/ArtifactBlockedResult"
              },
              {
                "$ref": "#/components/schemas/ArtifactBundleResult"
              },
              {
                "$ref": "#/components/schemas/ArtifactResponseJSON"
              },
              {
                "type": "null"
              }
            ],
            "title": "Result"
          }
        },
        "required": [
          "command_id",
          "run_id",
          "status",
          "owner_live",
          "expires_at",
          "result"
        ],
        "title": "ArtifactControlStatus",
        "type": "object"
      },
      "ArtifactPublishResult": {
        "additionalProperties": false,
        "properties": {
          "project_id": {
            "title": "Project Id",
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
          "size": {
            "title": "Size",
            "type": "integer"
          },
          "mime": {
            "title": "Mime",
            "type": "string"
          },
          "parent_version": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Parent Version"
          },
          "disposition": {
            "enum": [
              "canonical",
              "branch"
            ],
            "title": "Disposition",
            "type": "string"
          },
          "head_version": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Head Version"
          },
          "validation_status": {
            "const": "passed",
            "title": "Validation Status",
            "type": "string"
          },
          "approval_status": {
            "const": "approved",
            "title": "Approval Status",
            "type": "string"
          }
        },
        "required": [
          "project_id",
          "artifact_id",
          "version",
          "sha256",
          "size",
          "mime",
          "parent_version",
          "disposition",
          "head_version",
          "validation_status",
          "approval_status"
        ],
        "title": "ArtifactPublishResult",
        "type": "object"
      },
      "ArtifactCancelledResult": {
        "additionalProperties": false,
        "properties": {
          "cancel_requested": {
            "title": "Cancel Requested",
            "type": "boolean"
          },
          "effects_undone": {
            "const": false,
            "title": "Effects Undone",
            "type": "boolean"
          }
        },
        "required": [
          "cancel_requested",
          "effects_undone"
        ],
        "title": "ArtifactCancelledResult",
        "type": "object"
      },
      "ArtifactBlockedResult": {
        "additionalProperties": false,
        "properties": {
          "blocked": {
            "const": true,
            "title": "Blocked",
            "type": "boolean"
          },
          "reason": {
            "const": "budget_unavailable",
            "title": "Reason",
            "type": "string"
          }
        },
        "required": [
          "blocked",
          "reason"
        ],
        "title": "ArtifactBlockedResult",
        "type": "object"
      },
      "ArtifactBundleResult": {
        "additionalProperties": false,
        "properties": {
          "project_id": {
            "title": "Project Id",
            "type": "string"
          },
          "outputs": {
            "items": {
              "$ref": "#/components/schemas/ArtifactPublishResult"
            },
            "title": "Outputs",
            "type": "array"
          },
          "manifest": {
            "$ref": "#/components/schemas/ArtifactPublishResult"
          },
          "state": {
            "const": "published",
            "title": "State",
            "type": "string"
          },
          "publication_atomic": {
            "const": false,
            "title": "Publication Atomic",
            "type": "boolean"
          },
          "external_production": {
            "const": "not_performed",
            "title": "External Production",
            "type": "string"
          }
        },
        "required": [
          "project_id",
          "outputs",
          "manifest",
          "state",
          "publication_atomic",
          "external_production"
        ],
        "title": "ArtifactBundleResult",
        "type": "object"
      },
      "ArtifactResponseJSON": {
        "additionalProperties": false,
        "properties": {
          "project_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Project Id"
          },
          "response_json": {
            "maxLength": 3145728,
            "title": "Response Json",
            "type": "string"
          }
        },
        "required": [
          "response_json"
        ],
        "title": "ArtifactResponseJSON",
        "type": "object"
      },
      "ArtifactReadParams": {
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
          },
          "artifact_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Artifact Id",
            "type": "string"
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
          "project_id",
          "artifact_id"
        ],
        "title": "ArtifactReadParams",
        "type": "object"
      },
      "ArtifactReadResult": {
        "additionalProperties": false,
        "properties": {
          "project_id": {
            "title": "Project Id",
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
          "size": {
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
          "preview_mode": {
            "enum": [
              "plain_text",
              "download_only"
            ],
            "title": "Preview Mode",
            "type": "string"
          }
        },
        "required": [
          "project_id",
          "artifact_id",
          "version",
          "sha256",
          "size",
          "mime",
          "offset",
          "data_base64",
          "next_offset",
          "eof",
          "preview_mode"
        ],
        "title": "ArtifactReadResult",
        "type": "object"
      },
      "EvidenceCreateParams": {
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
          },
          "anchor_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Anchor Id",
            "type": "string"
          },
          "kind": {
            "enum": [
              "source_span",
              "source_id",
              "decision",
              "constraint",
              "approval",
              "artifact_version"
            ],
            "title": "Kind",
            "type": "string"
          },
          "source_ref": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ArtifactVersionRef"
              },
              {
                "$ref": "#/components/schemas/EvidenceCaptureRef"
              },
              {
                "$ref": "#/components/schemas/EvidenceApprovalRef"
              }
            ],
            "title": "Source Ref"
          },
          "source_version": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Source Version",
            "type": "string"
          },
          "range_ref": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/EvidenceNumericRange"
              },
              {
                "$ref": "#/components/schemas/EvidenceSectionRange"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Range Ref"
          },
          "captured_at": {
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
            "title": "Captured At"
          },
          "authority": {
            "default": "source_claim",
            "enum": [
              "observed",
              "source_claim",
              "user_approved",
              "inferred"
            ],
            "title": "Authority",
            "type": "string"
          },
          "validity": {
            "default": "unverified",
            "enum": [
              "current",
              "stale",
              "revoked",
              "unverified"
            ],
            "title": "Validity",
            "type": "string"
          },
          "fresh_until": {
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
            "title": "Fresh Until"
          },
          "annotation": {
            "default": "",
            "maxLength": 4096,
            "title": "Annotation",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "anchor_id",
          "kind",
          "source_ref",
          "source_version"
        ],
        "title": "EvidenceCreateParams",
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
      "EvidenceCaptureRef": {
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
        "title": "EvidenceCaptureRef",
        "type": "object"
      },
      "EvidenceApprovalRef": {
        "additionalProperties": false,
        "properties": {
          "approval_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Approval Id",
            "type": "string"
          }
        },
        "required": [
          "approval_id"
        ],
        "title": "EvidenceApprovalRef",
        "type": "object"
      },
      "EvidenceNumericRange": {
        "additionalProperties": false,
        "properties": {
          "unit": {
            "enum": [
              "line",
              "byte"
            ],
            "title": "Unit",
            "type": "string"
          },
          "start": {
            "minimum": 0,
            "title": "Start",
            "type": "integer"
          },
          "end": {
            "minimum": 0,
            "title": "End",
            "type": "integer"
          }
        },
        "required": [
          "unit",
          "start",
          "end"
        ],
        "title": "EvidenceNumericRange",
        "type": "object"
      },
      "EvidenceSectionRange": {
        "additionalProperties": false,
        "properties": {
          "unit": {
            "const": "section",
            "title": "Unit",
            "type": "string"
          },
          "start": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Start",
            "type": "string"
          },
          "end": {
            "maxLength": 256,
            "minLength": 1,
            "title": "End",
            "type": "string"
          }
        },
        "required": [
          "unit",
          "start",
          "end"
        ],
        "title": "EvidenceSectionRange",
        "type": "object"
      },
      "EvidenceResult": {
        "additionalProperties": false,
        "properties": {
          "evidence": {
            "$ref": "#/components/schemas/EvidenceRecord"
          }
        },
        "required": [
          "evidence"
        ],
        "title": "EvidenceResult",
        "type": "object"
      },
      "EvidenceRecord": {
        "additionalProperties": false,
        "properties": {
          "anchor_id": {
            "title": "Anchor Id",
            "type": "string"
          },
          "project_id": {
            "title": "Project Id",
            "type": "string"
          },
          "kind": {
            "enum": [
              "source_span",
              "source_id",
              "decision",
              "constraint",
              "approval",
              "artifact_version"
            ],
            "title": "Kind",
            "type": "string"
          },
          "source_ref": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ArtifactVersionRef"
              },
              {
                "$ref": "#/components/schemas/EvidenceCaptureRef"
              },
              {
                "$ref": "#/components/schemas/EvidenceApprovalRef"
              }
            ],
            "title": "Source Ref"
          },
          "source_version": {
            "title": "Source Version",
            "type": "string"
          },
          "range_ref": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/EvidenceNumericRange"
              },
              {
                "$ref": "#/components/schemas/EvidenceSectionRange"
              },
              {
                "type": "null"
              }
            ],
            "title": "Range Ref"
          },
          "captured_at": {
            "title": "Captured At",
            "type": "number"
          },
          "authority": {
            "enum": [
              "observed",
              "source_claim",
              "user_approved",
              "inferred"
            ],
            "title": "Authority",
            "type": "string"
          },
          "validity": {
            "enum": [
              "current",
              "stale",
              "revoked",
              "unverified"
            ],
            "title": "Validity",
            "type": "string"
          },
          "effective_validity": {
            "enum": [
              "current",
              "stale",
              "revoked",
              "unverified"
            ],
            "title": "Effective Validity",
            "type": "string"
          },
          "fresh_until": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Fresh Until"
          },
          "annotation": {
            "title": "Annotation",
            "type": "string"
          },
          "grants_execution": {
            "const": false,
            "title": "Grants Execution",
            "type": "boolean"
          }
        },
        "required": [
          "anchor_id",
          "project_id",
          "kind",
          "source_ref",
          "source_version",
          "range_ref",
          "captured_at",
          "authority",
          "validity",
          "effective_validity",
          "fresh_until",
          "annotation",
          "grants_execution"
        ],
        "title": "EvidenceRecord",
        "type": "object"
      },
      "EvidenceParams": {
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
          "anchor_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Anchor Id",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "anchor_id"
        ],
        "title": "EvidenceParams",
        "type": "object"
      },
      "SourceListParams": {
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
          "schema_version",
          "project_id"
        ],
        "title": "SourceListParams",
        "type": "object"
      },
      "EvidenceListResult": {
        "additionalProperties": false,
        "properties": {
          "evidence": {
            "items": {
              "$ref": "#/components/schemas/EvidenceRecord"
            },
            "title": "Evidence",
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
          "evidence",
          "limit",
          "limit_reached",
          "complete"
        ],
        "title": "EvidenceListResult",
        "type": "object"
      },
      "MemoryExportParams": {
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
          "include_deleted": {
            "default": false,
            "title": "Include Deleted",
            "type": "boolean"
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
          "schema_version"
        ],
        "title": "MemoryExportParams",
        "type": "object"
      },
      "MemoryExportResult": {
        "additionalProperties": false,
        "properties": {
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "size": {
            "title": "Size",
            "type": "integer"
          },
          "format": {
            "const": "json",
            "title": "Format",
            "type": "string"
          },
          "deletion_semantics": {
            "const": "tombstones_not_physical_erasure",
            "title": "Deletion Semantics",
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
          }
        },
        "required": [
          "revision",
          "sha256",
          "size",
          "format",
          "deletion_semantics",
          "offset",
          "data_base64",
          "next_offset",
          "eof"
        ],
        "title": "MemoryExportResult",
        "type": "object"
      },
      "MemoryDeleteParams": {
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
          "record_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Record Id",
            "type": "string"
          },
          "expected_version": {
            "minimum": 1,
            "title": "Expected Version",
            "type": "integer"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "record_id",
          "expected_version"
        ],
        "title": "MemoryDeleteParams",
        "type": "object"
      },
      "MemoryMutationResult": {
        "additionalProperties": false,
        "properties": {
          "outcome": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/MemoryWriteSuccess"
              },
              {
                "$ref": "#/components/schemas/MemoryWriteConflict"
              }
            ],
            "title": "Outcome"
          }
        },
        "required": [
          "outcome"
        ],
        "title": "MemoryMutationResult",
        "type": "object"
      },
      "MemoryWriteSuccess": {
        "additionalProperties": false,
        "properties": {
          "success": {
            "const": true,
            "title": "Success",
            "type": "boolean"
          },
          "record": {
            "$ref": "#/components/schemas/MemoryRecord"
          },
          "acknowledged_version": {
            "title": "Acknowledged Version",
            "type": "integer"
          },
          "revision": {
            "title": "Revision",
            "type": "integer"
          }
        },
        "required": [
          "success",
          "record",
          "acknowledged_version",
          "revision"
        ],
        "title": "MemoryWriteSuccess",
        "type": "object"
      },
      "MemoryRecord": {
        "additionalProperties": false,
        "properties": {
          "record_id": {
            "title": "Record Id",
            "type": "string"
          },
          "version": {
            "title": "Version",
            "type": "integer"
          },
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "supersedes_version": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Supersedes Version"
          },
          "owner_agent_id": {
            "title": "Owner Agent Id",
            "type": "string"
          },
          "owner_principal_id": {
            "title": "Owner Principal Id",
            "type": "string"
          },
          "owner_profile_id": {
            "title": "Owner Profile Id",
            "type": "string"
          },
          "namespace_id": {
            "title": "Namespace Id",
            "type": "string"
          },
          "target": {
            "enum": [
              "memory",
              "user"
            ],
            "title": "Target",
            "type": "string"
          },
          "kind": {
            "enum": [
              "stated_fact",
              "inference",
              "preference",
              "decision",
              "procedure_reference"
            ],
            "title": "Kind",
            "type": "string"
          },
          "content": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Content"
          },
          "source_ref": {
            "title": "Source Ref",
            "type": "string"
          },
          "author": {
            "title": "Author",
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
          "valid_from": {
            "title": "Valid From",
            "type": "number"
          },
          "valid_to": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Valid To"
          },
          "confidence": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Confidence"
          },
          "validity": {
            "enum": [
              "valid",
              "uncertain",
              "invalid",
              "superseded"
            ],
            "title": "Validity",
            "type": "string"
          },
          "scope": {
            "title": "Scope",
            "type": "string"
          },
          "deletion_state": {
            "enum": [
              "present",
              "deleted"
            ],
            "title": "Deletion State",
            "type": "string"
          },
          "deleted_at": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "title": "Deleted At"
          },
          "superseded_by_version": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Superseded By Version"
          }
        },
        "required": [
          "record_id",
          "version",
          "revision",
          "supersedes_version",
          "owner_agent_id",
          "owner_principal_id",
          "owner_profile_id",
          "namespace_id",
          "target",
          "kind",
          "content",
          "source_ref",
          "author",
          "created_at",
          "updated_at",
          "valid_from",
          "valid_to",
          "confidence",
          "validity",
          "scope",
          "deletion_state",
          "deleted_at"
        ],
        "title": "MemoryRecord",
        "type": "object"
      },
      "MemoryWriteConflict": {
        "additionalProperties": false,
        "properties": {
          "success": {
            "const": false,
            "title": "Success",
            "type": "boolean"
          },
          "code": {
            "const": "version_conflict",
            "title": "Code",
            "type": "string"
          },
          "conflict_id": {
            "title": "Conflict Id",
            "type": "string"
          },
          "record_id": {
            "title": "Record Id",
            "type": "string"
          },
          "expected_version": {
            "title": "Expected Version",
            "type": "integer"
          },
          "current_version": {
            "title": "Current Version",
            "type": "integer"
          }
        },
        "required": [
          "success",
          "code",
          "conflict_id",
          "record_id",
          "expected_version",
          "current_version"
        ],
        "title": "MemoryWriteConflict",
        "type": "object"
      },
      "MemoryRecordParams": {
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
          "record_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Record Id",
            "type": "string"
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
          "session_id",
          "schema_version",
          "record_id"
        ],
        "title": "MemoryRecordParams",
        "type": "object"
      },
      "MemoryRecordResult": {
        "additionalProperties": false,
        "properties": {
          "record": {
            "$ref": "#/components/schemas/MemoryRecord"
          }
        },
        "required": [
          "record"
        ],
        "title": "MemoryRecordResult",
        "type": "object"
      },
      "MemoryWriteParams": {
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
          "content": {
            "maxLength": 65536,
            "minLength": 1,
            "title": "Content",
            "type": "string"
          },
          "record_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Record Id",
            "type": "string"
          },
          "expected_version": {
            "default": 0,
            "minimum": 0,
            "title": "Expected Version",
            "type": "integer"
          },
          "target": {
            "default": "memory",
            "enum": [
              "memory",
              "user"
            ],
            "title": "Target",
            "type": "string"
          },
          "kind": {
            "default": "stated_fact",
            "enum": [
              "stated_fact",
              "inference",
              "preference",
              "decision",
              "procedure_reference"
            ],
            "title": "Kind",
            "type": "string"
          },
          "source_ref": {
            "anyOf": [
              {
                "maxLength": 4096,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Source Ref"
          },
          "author": {
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
            "title": "Author"
          },
          "valid_from": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Valid From"
          },
          "valid_to": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Valid To"
          },
          "confidence": {
            "anyOf": [
              {
                "maximum": 1,
                "minimum": 0,
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Confidence"
          },
          "validity": {
            "default": "valid",
            "enum": [
              "valid",
              "uncertain",
              "invalid"
            ],
            "title": "Validity",
            "type": "string"
          },
          "scope": {
            "default": "individual",
            "maxLength": 264,
            "minLength": 1,
            "title": "Scope",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "content",
          "record_id"
        ],
        "title": "MemoryWriteParams",
        "type": "object"
      },
      "MemoryListParams": {
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
          "include_deleted": {
            "default": false,
            "title": "Include Deleted",
            "type": "boolean"
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
          "offset": {
            "default": 0,
            "minimum": 0,
            "title": "Offset",
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
        "title": "MemoryListParams",
        "type": "object"
      },
      "MemoryListResult": {
        "additionalProperties": false,
        "properties": {
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "records": {
            "items": {
              "$ref": "#/components/schemas/MemoryRecord"
            },
            "title": "Records",
            "type": "array"
          },
          "offset": {
            "title": "Offset",
            "type": "integer"
          },
          "next_offset": {
            "title": "Next Offset",
            "type": "integer"
          },
          "total": {
            "title": "Total",
            "type": "integer"
          },
          "has_more": {
            "title": "Has More",
            "type": "boolean"
          }
        },
        "required": [
          "revision",
          "records",
          "offset",
          "next_offset",
          "total",
          "has_more"
        ],
        "title": "MemoryListResult",
        "type": "object"
      },
      "MemoryScopeParams": {
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
            "title": "Project Id"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id"
        ],
        "title": "MemoryScopeParams",
        "type": "object"
      },
      "MemoryScopeResult": {
        "additionalProperties": false,
        "properties": {
          "project_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Project Id"
          },
          "scope_key": {
            "title": "Scope Key",
            "type": "string"
          }
        },
        "required": [
          "project_id",
          "scope_key"
        ],
        "title": "MemoryScopeResult",
        "type": "object"
      },
      "MemoryStatusResult": {
        "additionalProperties": false,
        "properties": {
          "capabilities": {
            "$ref": "#/components/schemas/MemoryCapabilities"
          },
          "health": {
            "$ref": "#/components/schemas/MemoryHealth"
          }
        },
        "required": [
          "capabilities",
          "health"
        ],
        "title": "MemoryStatusResult",
        "type": "object"
      },
      "MemoryCapabilities": {
        "additionalProperties": false,
        "properties": {
          "backend": {
            "enum": [
              "builtin",
              "personal_mcp"
            ],
            "title": "Backend",
            "type": "string"
          },
          "recall": {
            "title": "Recall",
            "type": "boolean"
          },
          "write": {
            "title": "Write",
            "type": "boolean"
          },
          "supersede": {
            "title": "Supersede",
            "type": "boolean"
          },
          "delete": {
            "title": "Delete",
            "type": "boolean"
          },
          "export": {
            "title": "Export",
            "type": "boolean"
          },
          "session_ingest": {
            "title": "Session Ingest",
            "type": "boolean"
          }
        },
        "required": [
          "backend",
          "recall",
          "write",
          "supersede",
          "delete",
          "export",
          "session_ingest"
        ],
        "title": "MemoryCapabilities",
        "type": "object"
      },
      "MemoryHealth": {
        "additionalProperties": false,
        "properties": {
          "backend": {
            "enum": [
              "builtin",
              "personal_mcp"
            ],
            "title": "Backend",
            "type": "string"
          },
          "status": {
            "enum": [
              "ready",
              "unconfigured",
              "degraded",
              "disabled"
            ],
            "title": "Status",
            "type": "string"
          },
          "reason_code": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Reason Code"
          },
          "supported_operations": {
            "items": {
              "type": "string"
            },
            "title": "Supported Operations",
            "type": "array"
          }
        },
        "required": [
          "backend",
          "status",
          "reason_code",
          "supported_operations"
        ],
        "title": "MemoryHealth",
        "type": "object"
      },
      "MissionCreateParams": {
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
          "previous_mission_id": {
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
            "title": "Previous Mission Id"
          },
          "previous_revision": {
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
            "title": "Previous Revision"
          },
          "mission_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Mission Id",
            "type": "string"
          },
          "contract": {
            "$ref": "#/components/schemas/MissionIntent"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "mission_id",
          "contract"
        ],
        "title": "MissionCreateParams",
        "type": "object"
      },
      "MissionIntent": {
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
          }
        },
        "required": [
          "outcome"
        ],
        "title": "MissionIntent",
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
      "RuntimeProjectGrantsParams": {
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
          },
          "expected_revision": {
            "minimum": 0,
            "title": "Expected Revision",
            "type": "integer"
          },
          "grants": {
            "items": {
              "$ref": "#/components/schemas/ProjectGrant"
            },
            "maxItems": 100,
            "title": "Grants",
            "type": "array"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "expected_revision",
          "grants"
        ],
        "title": "RuntimeProjectGrantsParams",
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
      "SpecialistProjectParams": {
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
        "title": "SpecialistProjectParams",
        "type": "object"
      },
      "SpecialistCatalog": {
        "additionalProperties": false,
        "properties": {
          "specialists": {
            "items": {
              "$ref": "#/components/schemas/SpecialistDescriptor"
            },
            "title": "Specialists",
            "type": "array"
          },
          "unavailable": {
            "items": {
              "$ref": "#/components/schemas/SpecialistUnavailable"
            },
            "title": "Unavailable",
            "type": "array"
          },
          "teams_enabled": {
            "const": false,
            "default": false,
            "title": "Teams Enabled",
            "type": "boolean"
          },
          "execution": {
            "const": "local_single_child",
            "default": "local_single_child",
            "title": "Execution",
            "type": "string"
          }
        },
        "required": [
          "specialists",
          "unavailable"
        ],
        "title": "SpecialistCatalog",
        "type": "object"
      },
      "SpecialistDescriptor": {
        "additionalProperties": false,
        "properties": {
          "agent_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Agent Id",
            "type": "string"
          },
          "responsibility": {
            "title": "Responsibility",
            "type": "string"
          },
          "manifest_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Manifest Sha256",
            "type": "string"
          },
          "methods_ref": {
            "$ref": "#/components/schemas/SpecialistReference"
          },
          "limits": {
            "$ref": "#/components/schemas/SpecialistLimits"
          },
          "grants": {
            "$ref": "#/components/schemas/SpecialistGrants"
          },
          "builtin_memory_namespace": {
            "title": "Builtin Memory Namespace",
            "type": "string"
          },
          "output_contract_json": {
            "title": "Output Contract Json",
            "type": "string"
          }
        },
        "required": [
          "agent_id",
          "responsibility",
          "manifest_sha256",
          "methods_ref",
          "limits",
          "grants",
          "builtin_memory_namespace",
          "output_contract_json"
        ],
        "title": "SpecialistDescriptor",
        "type": "object"
      },
      "SpecialistReference": {
        "additionalProperties": false,
        "properties": {
          "id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Id",
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
          }
        },
        "required": [
          "id",
          "version",
          "sha256"
        ],
        "title": "SpecialistReference",
        "type": "object"
      },
      "SpecialistLimits": {
        "additionalProperties": false,
        "properties": {
          "max_depth": {
            "title": "Max Depth",
            "type": "integer"
          },
          "max_total_children": {
            "title": "Max Total Children",
            "type": "integer"
          },
          "max_concurrent_children": {
            "title": "Max Concurrent Children",
            "type": "integer"
          }
        },
        "required": [
          "max_depth",
          "max_total_children",
          "max_concurrent_children"
        ],
        "title": "SpecialistLimits",
        "type": "object"
      },
      "SpecialistGrants": {
        "additionalProperties": false,
        "properties": {
          "allowed_tools": {
            "items": {
              "type": "string"
            },
            "title": "Allowed Tools",
            "type": "array"
          },
          "project_grants": {
            "items": {
              "type": "string"
            },
            "title": "Project Grants",
            "type": "array"
          },
          "mcp_grants": {
            "additionalProperties": {
              "items": {
                "type": "string"
              },
              "type": "array"
            },
            "title": "Mcp Grants",
            "type": "object"
          },
          "memory_backend": {
            "const": "builtin",
            "title": "Memory Backend",
            "type": "string"
          },
          "personal_memory_access": {
            "const": false,
            "default": false,
            "title": "Personal Memory Access",
            "type": "boolean"
          }
        },
        "required": [
          "allowed_tools",
          "project_grants",
          "mcp_grants",
          "memory_backend"
        ],
        "title": "SpecialistGrants",
        "type": "object"
      },
      "SpecialistUnavailable": {
        "additionalProperties": false,
        "properties": {
          "agent_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Agent Id",
            "type": "string"
          },
          "code": {
            "title": "Code",
            "type": "string"
          }
        },
        "required": [
          "agent_id",
          "code"
        ],
        "title": "SpecialistUnavailable",
        "type": "object"
      },
      "SpecialistHandoffParams": {
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
          "selection": {
            "$ref": "#/components/schemas/SpecialistSelection"
          },
          "preview_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Preview Sha256",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "command_id",
          "idempotency_key",
          "expected_revision",
          "selection",
          "preview_sha256"
        ],
        "title": "SpecialistHandoffParams",
        "type": "object"
      },
      "SpecialistSelection": {
        "additionalProperties": false,
        "properties": {
          "project_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Project Id",
            "type": "string"
          },
          "specialist_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Specialist Id",
            "type": "string"
          },
          "objective": {
            "maxLength": 16384,
            "minLength": 1,
            "title": "Objective",
            "type": "string"
          },
          "artifacts": {
            "items": {
              "$ref": "#/components/schemas/SpecialistReference"
            },
            "maxItems": 32,
            "title": "Artifacts",
            "type": "array"
          },
          "evidence": {
            "items": {
              "$ref": "#/components/schemas/SpecialistReference"
            },
            "maxItems": 32,
            "title": "Evidence",
            "type": "array"
          },
          "constraints": {
            "items": {
              "maxLength": 2048,
              "minLength": 1,
              "type": "string"
            },
            "maxItems": 16,
            "title": "Constraints",
            "type": "array"
          },
          "manifest_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Manifest Sha256",
            "type": "string"
          },
          "config_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Config Digest",
            "type": "string"
          },
          "parent_policy_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Parent Policy Digest",
            "type": "string"
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
            "title": "Mission Id"
          },
          "mission_revision": {
            "anyOf": [
              {
                "minimum": 1,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Mission Revision"
          },
          "expires_at": {
            "exclusiveMinimum": 0,
            "title": "Expires At",
            "type": "number"
          }
        },
        "required": [
          "project_id",
          "specialist_id",
          "objective",
          "manifest_sha256",
          "config_digest",
          "parent_policy_digest",
          "mission_id",
          "mission_revision",
          "expires_at"
        ],
        "title": "SpecialistSelection",
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
      "SpecialistPreviewParams": {
        "additionalProperties": false,
        "properties": {
          "project_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Project Id",
            "type": "string"
          },
          "specialist_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Specialist Id",
            "type": "string"
          },
          "objective": {
            "maxLength": 16384,
            "minLength": 1,
            "title": "Objective",
            "type": "string"
          },
          "artifacts": {
            "items": {
              "$ref": "#/components/schemas/SpecialistReference"
            },
            "maxItems": 32,
            "title": "Artifacts",
            "type": "array"
          },
          "evidence": {
            "items": {
              "$ref": "#/components/schemas/SpecialistReference"
            },
            "maxItems": 32,
            "title": "Evidence",
            "type": "array"
          },
          "constraints": {
            "items": {
              "maxLength": 2048,
              "minLength": 1,
              "type": "string"
            },
            "maxItems": 16,
            "title": "Constraints",
            "type": "array"
          },
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
          "project_id",
          "specialist_id",
          "objective",
          "session_id",
          "schema_version"
        ],
        "title": "SpecialistPreviewParams",
        "type": "object"
      },
      "SpecialistPreview": {
        "additionalProperties": false,
        "properties": {
          "specialist": {
            "$ref": "#/components/schemas/SpecialistDescriptor"
          },
          "selection": {
            "$ref": "#/components/schemas/SpecialistSelection"
          },
          "preview_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Preview Sha256",
            "type": "string"
          },
          "runtime_revision": {
            "title": "Runtime Revision",
            "type": "integer"
          }
        },
        "required": [
          "specialist",
          "selection",
          "preview_sha256",
          "runtime_revision"
        ],
        "title": "SpecialistPreview",
        "type": "object"
      },
      "SpecialistStatusParams": {
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
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "command_id"
        ],
        "title": "SpecialistStatusParams",
        "type": "object"
      },
      "SpecialistStatus": {
        "additionalProperties": false,
        "properties": {
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "run_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Run Id",
            "type": "string"
          },
          "specialist_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Specialist Id",
            "type": "string"
          },
          "manifest_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Manifest Sha256",
            "type": "string"
          },
          "project_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Project Id",
            "type": "string"
          },
          "status": {
            "enum": [
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
          "outcome": {
            "enum": [
              "pending",
              "running",
              "completed",
              "failed",
              "blocked",
              "cancelled",
              "unknown"
            ],
            "title": "Outcome",
            "type": "string"
          },
          "completion": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/SpecialistCompletion"
              },
              {
                "type": "null"
              }
            ]
          },
          "execution_resumed": {
            "const": false,
            "default": false,
            "title": "Execution Resumed",
            "type": "boolean"
          }
        },
        "required": [
          "command_id",
          "run_id",
          "specialist_id",
          "manifest_sha256",
          "project_id",
          "status",
          "outcome",
          "completion"
        ],
        "title": "SpecialistStatus",
        "type": "object"
      },
      "SpecialistCompletion": {
        "additionalProperties": false,
        "properties": {
          "specialist_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Specialist Id",
            "type": "string"
          },
          "manifest_sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Manifest Sha256",
            "type": "string"
          },
          "project_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Project Id",
            "type": "string"
          },
          "child_id": {
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
            "title": "Child Id"
          },
          "handoff_sha256": {
            "anyOf": [
              {
                "pattern": "^[0-9a-f]{64}$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Handoff Sha256"
          },
          "state": {
            "enum": [
              "completed",
              "failed",
              "blocked",
              "cancelled",
              "unknown"
            ],
            "title": "State",
            "type": "string"
          },
          "summary": {
            "maxLength": 32768,
            "title": "Summary",
            "type": "string"
          },
          "summary_truncated": {
            "title": "Summary Truncated",
            "type": "boolean"
          },
          "schema_valid": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ],
            "title": "Schema Valid"
          },
          "parent_review_required": {
            "const": true,
            "default": true,
            "title": "Parent Review Required",
            "type": "boolean"
          },
          "execution_resumed": {
            "const": false,
            "default": false,
            "title": "Execution Resumed",
            "type": "boolean"
          }
        },
        "required": [
          "specialist_id",
          "manifest_sha256",
          "project_id",
          "child_id",
          "handoff_sha256",
          "state",
          "summary",
          "summary_truncated",
          "schema_valid"
        ],
        "title": "SpecialistCompletion",
        "type": "object"
      },
      "WorkflowCreateParams": {
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
          "definition_json": {
            "maxLength": 262144,
            "minLength": 2,
            "title": "Definition Json",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "command_id",
          "definition_json"
        ],
        "title": "WorkflowCreateParams",
        "type": "object"
      },
      "WorkflowResult": {
        "additionalProperties": false,
        "properties": {
          "workflow": {
            "$ref": "#/components/schemas/WorkflowRecord"
          }
        },
        "required": [
          "workflow"
        ],
        "title": "WorkflowResult",
        "type": "object"
      },
      "WorkflowRecord": {
        "additionalProperties": false,
        "properties": {
          "workflow_id": {
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "title": "Version",
            "type": "integer"
          },
          "project_id": {
            "title": "Project Id",
            "type": "string"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "definition_json": {
            "title": "Definition Json",
            "type": "string"
          },
          "state": {
            "enum": [
              "draft",
              "tested",
              "approved",
              "deprecated",
              "revoked"
            ],
            "title": "State",
            "type": "string"
          },
          "revision": {
            "title": "Revision",
            "type": "integer"
          },
          "evaluation_ref": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Evaluation Ref"
          },
          "active_version": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Active Version"
          },
          "head_revision": {
            "title": "Head Revision",
            "type": "integer"
          }
        },
        "required": [
          "workflow_id",
          "version",
          "project_id",
          "sha256",
          "definition_json",
          "state",
          "revision",
          "evaluation_ref",
          "active_version",
          "head_revision"
        ],
        "title": "WorkflowRecord",
        "type": "object"
      },
      "WorkflowDecisionCommitParams": {
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
          },
          "workflow_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "expected_revision": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Expected Revision",
            "type": "integer"
          },
          "expected_head_revision": {
            "minimum": 0,
            "title": "Expected Head Revision",
            "type": "integer"
          },
          "action": {
            "enum": [
              "approve",
              "deprecate",
              "revoke",
              "rollback",
              "authorize_export"
            ],
            "title": "Action",
            "type": "string"
          },
          "recipient": {
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
            "title": "Recipient"
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
          "project_id",
          "workflow_id",
          "version",
          "command_id",
          "sha256",
          "expected_revision",
          "expected_head_revision",
          "action",
          "approval_id",
          "approval_digest"
        ],
        "title": "WorkflowDecisionCommitParams",
        "type": "object"
      },
      "WorkflowDecisionResult": {
        "additionalProperties": false,
        "properties": {
          "workflow": {
            "$ref": "#/components/schemas/WorkflowRecord"
          },
          "decision_json": {
            "title": "Decision Json",
            "type": "string"
          }
        },
        "required": [
          "workflow",
          "decision_json"
        ],
        "title": "WorkflowDecisionResult",
        "type": "object"
      },
      "WorkflowDecisionParams": {
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
          },
          "workflow_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "expected_revision": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Expected Revision",
            "type": "integer"
          },
          "expected_head_revision": {
            "minimum": 0,
            "title": "Expected Head Revision",
            "type": "integer"
          },
          "action": {
            "enum": [
              "approve",
              "deprecate",
              "revoke",
              "rollback",
              "authorize_export"
            ],
            "title": "Action",
            "type": "string"
          },
          "recipient": {
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
            "title": "Recipient"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "workflow_id",
          "version",
          "command_id",
          "sha256",
          "expected_revision",
          "expected_head_revision",
          "action"
        ],
        "title": "WorkflowDecisionParams",
        "type": "object"
      },
      "WorkflowDecisionPrepareResult": {
        "additionalProperties": false,
        "properties": {
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
          },
          "scope_json": {
            "title": "Scope Json",
            "type": "string"
          },
          "workflow": {
            "$ref": "#/components/schemas/WorkflowRecord"
          }
        },
        "required": [
          "approval_id",
          "approval_digest",
          "expires_at",
          "scope_json",
          "workflow"
        ],
        "title": "WorkflowDecisionPrepareResult",
        "type": "object"
      },
      "WorkflowDeliveryCommitParams": {
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
          },
          "workflow_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "specialist_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Specialist Id",
            "type": "string"
          },
          "expected_delivery_revision": {
            "minimum": 0,
            "title": "Expected Delivery Revision",
            "type": "integer"
          },
          "action": {
            "enum": [
              "deliver",
              "rollback"
            ],
            "title": "Action",
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
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "workflow_id",
          "version",
          "command_id",
          "sha256",
          "specialist_id",
          "expected_delivery_revision",
          "action",
          "approval_id",
          "approval_digest"
        ],
        "title": "WorkflowDeliveryCommitParams",
        "type": "object"
      },
      "WorkflowDeliveryCommitResult": {
        "additionalProperties": false,
        "properties": {
          "delivery": {
            "$ref": "#/components/schemas/WorkflowDeliveryRecord"
          }
        },
        "required": [
          "delivery"
        ],
        "title": "WorkflowDeliveryCommitResult",
        "type": "object"
      },
      "WorkflowDeliveryRecord": {
        "additionalProperties": false,
        "properties": {
          "delivery_id": {
            "title": "Delivery Id",
            "type": "string"
          },
          "project_id": {
            "title": "Project Id",
            "type": "string"
          },
          "workflow_id": {
            "title": "Workflow Id",
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
          "specialist_id": {
            "title": "Specialist Id",
            "type": "string"
          },
          "delivery_revision": {
            "title": "Delivery Revision",
            "type": "integer"
          },
          "action": {
            "enum": [
              "deliver",
              "rollback"
            ],
            "title": "Action",
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
          "previous_delivery_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Previous Delivery Id"
          },
          "activation": {
            "const": "next_session",
            "title": "Activation",
            "type": "string"
          },
          "execution_authority": {
            "const": false,
            "title": "Execution Authority",
            "type": "boolean"
          },
          "personal_memory_shared": {
            "const": false,
            "title": "Personal Memory Shared",
            "type": "boolean"
          },
          "recorded_at": {
            "title": "Recorded At",
            "type": "number"
          }
        },
        "required": [
          "delivery_id",
          "project_id",
          "workflow_id",
          "version",
          "sha256",
          "specialist_id",
          "delivery_revision",
          "action",
          "approval_id",
          "approval_digest",
          "previous_delivery_id",
          "activation",
          "execution_authority",
          "personal_memory_shared",
          "recorded_at"
        ],
        "title": "WorkflowDeliveryRecord",
        "type": "object"
      },
      "WorkflowDeliveryListParams": {
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
          },
          "specialist_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Specialist Id",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "specialist_id"
        ],
        "title": "WorkflowDeliveryListParams",
        "type": "object"
      },
      "WorkflowDeliveryListResult": {
        "additionalProperties": false,
        "properties": {
          "deliveries": {
            "items": {
              "$ref": "#/components/schemas/WorkflowDeliveryRecord"
            },
            "title": "Deliveries",
            "type": "array"
          },
          "complete": {
            "const": true,
            "title": "Complete",
            "type": "boolean"
          }
        },
        "required": [
          "deliveries",
          "complete"
        ],
        "title": "WorkflowDeliveryListResult",
        "type": "object"
      },
      "WorkflowDeliveryParams": {
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
          },
          "workflow_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "specialist_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Specialist Id",
            "type": "string"
          },
          "expected_delivery_revision": {
            "minimum": 0,
            "title": "Expected Delivery Revision",
            "type": "integer"
          },
          "action": {
            "enum": [
              "deliver",
              "rollback"
            ],
            "title": "Action",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "workflow_id",
          "version",
          "command_id",
          "sha256",
          "specialist_id",
          "expected_delivery_revision",
          "action"
        ],
        "title": "WorkflowDeliveryParams",
        "type": "object"
      },
      "WorkflowDeliveryPrepareResult": {
        "additionalProperties": false,
        "properties": {
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
          },
          "scope_json": {
            "title": "Scope Json",
            "type": "string"
          },
          "workflow": {
            "$ref": "#/components/schemas/WorkflowRecord"
          },
          "current_delivery": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/WorkflowDeliveryRecord"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "approval_id",
          "approval_digest",
          "expires_at",
          "scope_json",
          "workflow",
          "current_delivery"
        ],
        "title": "WorkflowDeliveryPrepareResult",
        "type": "object"
      },
      "WorkflowEvaluateParams": {
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
          },
          "workflow_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "expected_revision": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Expected Revision",
            "type": "integer"
          },
          "cases_json": {
            "maxLength": 262144,
            "minLength": 2,
            "title": "Cases Json",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "workflow_id",
          "version",
          "command_id",
          "expected_revision",
          "cases_json"
        ],
        "title": "WorkflowEvaluateParams",
        "type": "object"
      },
      "WorkflowEvaluateResult": {
        "additionalProperties": false,
        "properties": {
          "workflow": {
            "$ref": "#/components/schemas/WorkflowRecord"
          },
          "evaluation_json": {
            "title": "Evaluation Json",
            "type": "string"
          }
        },
        "required": [
          "workflow",
          "evaluation_json"
        ],
        "title": "WorkflowEvaluateResult",
        "type": "object"
      },
      "WorkflowFeedbackParams": {
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
          },
          "workflow_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "evidence_json": {
            "maxLength": 262144,
            "minLength": 2,
            "title": "Evidence Json",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "workflow_id",
          "version",
          "command_id",
          "evidence_json"
        ],
        "title": "WorkflowFeedbackParams",
        "type": "object"
      },
      "WorkflowEvidenceResult": {
        "additionalProperties": false,
        "properties": {
          "evidence_json": {
            "title": "Evidence Json",
            "type": "string"
          }
        },
        "required": [
          "evidence_json"
        ],
        "title": "WorkflowEvidenceResult",
        "type": "object"
      },
      "WorkflowVersionParams": {
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
          },
          "workflow_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "workflow_id",
          "version"
        ],
        "title": "WorkflowVersionParams",
        "type": "object"
      },
      "WorkflowProjectParams": {
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
        "title": "WorkflowProjectParams",
        "type": "object"
      },
      "WorkflowListResult": {
        "additionalProperties": false,
        "properties": {
          "workflows": {
            "items": {
              "$ref": "#/components/schemas/WorkflowRecord"
            },
            "title": "Workflows",
            "type": "array"
          },
          "complete": {
            "const": false,
            "title": "Complete",
            "type": "boolean"
          }
        },
        "required": [
          "workflows",
          "complete"
        ],
        "title": "WorkflowListResult",
        "type": "object"
      },
      "WorkflowRunParams": {
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
          },
          "workflow_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "mission_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Mission Id",
            "type": "string"
          },
          "mission_revision": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Mission Revision",
            "type": "integer"
          },
          "parameters_json": {
            "maxLength": 262144,
            "minLength": 2,
            "title": "Parameters Json",
            "type": "string"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "workflow_id",
          "version",
          "command_id",
          "sha256",
          "mission_id",
          "mission_revision",
          "parameters_json"
        ],
        "title": "WorkflowRunParams",
        "type": "object"
      },
      "WorkflowRunPrepareResult": {
        "additionalProperties": false,
        "properties": {
          "workflow_run_id": {
            "title": "Workflow Run Id",
            "type": "string"
          },
          "pin_json": {
            "title": "Pin Json",
            "type": "string"
          },
          "proposals": {
            "items": {
              "$ref": "#/components/schemas/ArtifactProposalResult"
            },
            "title": "Proposals",
            "type": "array"
          },
          "publication_atomic": {
            "const": false,
            "title": "Publication Atomic",
            "type": "boolean"
          }
        },
        "required": [
          "workflow_run_id",
          "pin_json",
          "proposals",
          "publication_atomic"
        ],
        "title": "WorkflowRunPrepareResult",
        "type": "object"
      },
      "ArtifactProposalResult": {
        "additionalProperties": false,
        "properties": {
          "request_id": {
            "title": "Request Id",
            "type": "string"
          },
          "project_id": {
            "title": "Project Id",
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
          "size": {
            "title": "Size",
            "type": "integer"
          },
          "mime": {
            "title": "Mime",
            "type": "string"
          },
          "parent_version": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Parent Version"
          },
          "expected_head_version": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Expected Head Version"
          },
          "action_digest": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Action Digest",
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
          "request_id",
          "project_id",
          "artifact_id",
          "version",
          "sha256",
          "size",
          "mime",
          "parent_version",
          "expected_head_version",
          "action_digest",
          "approval_id",
          "approval_digest",
          "expires_at"
        ],
        "title": "ArtifactProposalResult",
        "type": "object"
      },
      "WorkflowRunPublishParams": {
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
          },
          "workflow_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Workflow Id",
            "type": "string"
          },
          "version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Version",
            "type": "integer"
          },
          "command_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Command Id",
            "type": "string"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "mission_id": {
            "maxLength": 256,
            "minLength": 1,
            "title": "Mission Id",
            "type": "string"
          },
          "mission_revision": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Mission Revision",
            "type": "integer"
          },
          "parameters_json": {
            "maxLength": 262144,
            "minLength": 2,
            "title": "Parameters Json",
            "type": "string"
          },
          "approvals": {
            "items": {
              "$ref": "#/components/schemas/DomainApproval"
            },
            "maxItems": 33,
            "minItems": 2,
            "title": "Approvals",
            "type": "array"
          }
        },
        "required": [
          "session_id",
          "schema_version",
          "project_id",
          "workflow_id",
          "version",
          "command_id",
          "sha256",
          "mission_id",
          "mission_revision",
          "parameters_json",
          "approvals"
        ],
        "title": "WorkflowRunPublishParams",
        "type": "object"
      },
      "DomainApproval": {
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
          }
        },
        "required": [
          "approval_id",
          "approval_digest"
        ],
        "title": "DomainApproval",
        "type": "object"
      },
      "WorkflowRunPublishResult": {
        "additionalProperties": false,
        "properties": {
          "workflow_run_id": {
            "title": "Workflow Run Id",
            "type": "string"
          },
          "state": {
            "const": "published",
            "title": "State",
            "type": "string"
          },
          "outputs": {
            "items": {
              "$ref": "#/components/schemas/ArtifactPublishResult"
            },
            "title": "Outputs",
            "type": "array"
          },
          "manifest": {
            "$ref": "#/components/schemas/ArtifactPublishResult"
          },
          "publication_atomic": {
            "const": false,
            "title": "Publication Atomic",
            "type": "boolean"
          },
          "mission_completed": {
            "const": false,
            "title": "Mission Completed",
            "type": "boolean"
          }
        },
        "required": [
          "workflow_run_id",
          "state",
          "outputs",
          "manifest",
          "publication_atomic",
          "mission_completed"
        ],
        "title": "WorkflowRunPublishResult",
        "type": "object"
      },
      "WorkflowHistoryResult": {
        "additionalProperties": false,
        "properties": {
          "runs_json": {
            "title": "Runs Json",
            "type": "string"
          },
          "complete": {
            "const": false,
            "title": "Complete",
            "type": "boolean"
          }
        },
        "required": [
          "runs_json",
          "complete"
        ],
        "title": "WorkflowHistoryResult",
        "type": "object"
      },
      "WorkflowTemplateResult": {
        "additionalProperties": false,
        "properties": {
          "template_id": {
            "title": "Template Id",
            "type": "string"
          },
          "version": {
            "title": "Version",
            "type": "integer"
          },
          "project_id": {
            "title": "Project Id",
            "type": "string"
          },
          "sha256": {
            "pattern": "^[0-9a-f]{64}$",
            "title": "Sha256",
            "type": "string"
          },
          "definition_json": {
            "title": "Definition Json",
            "type": "string"
          }
        },
        "required": [
          "template_id",
          "version",
          "project_id",
          "sha256",
          "definition_json"
        ],
        "title": "WorkflowTemplateResult",
        "type": "object"
      }
    }
  }
};
