// UNIT_ONLY endpoint-owned synthetic rows copied literally from the sealed prospective plan.
// No directory, authority, accepted effect, ledger or native-worker claim.
export const DTO = {
  "classification": "UNIT_ONLY synthetic plain endpoint-owned result rows; not backend store/native receipts/authentication facts; no actual directory created",
  "clock": 1000,
  "previewExpiresAt": 30000,
  "grantExpiresAt": 20000,
  "references": {
    "owner": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
    "workspace": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
    "taskA": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
    "taskB": "9f0d4e239ab575c9f8174aec1e1497f6771298ddf3702458fa232c36d2155ab8",
    "contextRecord": "475554c0cfa10aa5e1f5a44937a1d1b60205738c3d0aa7a57cfcf343bdbc3be4",
    "contextDigest": "5458bfbd0f644877b5ae3983a0f19bf0c3cda344113f41a2f066c2e5b52cc2d8",
    "source": "3c51ee67af29d03cd6782147e47fce88bdcad32be3d39c4817a30707a7306ee3",
    "memoryNamespace": "b9181c8d965c324cfd8bff866c017c1291db9710092fb7bbb58a0a47988d5499",
    "action": "76ef9445e321532b0e1ce69803423ff2ba82d7d01be6c0952665248c05f011a6",
    "actionDigest": "b9589e35bc515263e4f2919fabfd1563163aa098a5f128c002fe38ceb5b28488",
    "preview": "2b4526a450e1a92cc0b7ee9f1fe19d5c11787714e1dc777eb2c713bb82fd2e2f",
    "environment": "67a8f14b46e42dc242965eb1d0b48165b35cd1c226bbd09db1764bdce7cefb0b",
    "configuration": "07d02812bd03ec43e8641e663849505d5d613d75b64d17d5dacaeae7c7f896ec",
    "claim": "a3daf11862d74095f5abae2fc06d4626be834cf024acde7ca35e3b7a6d1e92d2",
    "reservation": "ce34bec9ee921b334be42fe271fea0fc740e7f6408dfc1613edc7ac3053be8a2",
    "generation": "1accb6dd9fcf5f7448e1970620b5fe12c03c8f10150e56744e931784e7a68389",
    "session": "02075246346b062786c89440217f7267f6b6bdd71424ec24e1d849096e3d7e80",
    "execution": "bccf6253135f5e207ad76e358e6610b53e69fe838e685000d22dc0cc95934fba"
  },
  "workerStatus": {
    "enabled": true,
    "phase": "ready",
    "reasonCode": null,
    "configurationRef": "07d02812bd03ec43e8641e663849505d5d613d75b64d17d5dacaeae7c7f896ec",
    "policyVersion": 1,
    "selection": {
      "provider": "UNIT_ONLY-provider",
      "model": "UNIT_ONLY-model",
      "agentPreset": "UNIT_ONLY-preset",
      "reasoningEffort": null,
      "maxOutputTokens": 128
    },
    "environment": {
      "root": "/tmp/UNIT_ONLY/df-ui-worker-r2",
      "cwd": "/tmp/UNIT_ONLY/df-ui-worker-r2"
    },
    "persistence": {
      "directory": "/tmp/UNIT_ONLY/df-ui-worker-r2/transcripts",
      "compression": "none",
      "retention": "owner-managed",
      "encrypted": false
    },
    "bounds": {
      "requestBytes": 4096,
      "resultBytes": 1024
    },
    "accounting": "df-testing-utf8-byte-units/v1",
    "pricing": "source_zero",
    "actionsEnabled": true
  },
  "taskListInitial": [
    {
      "ownerRef": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
      "workspaceRef": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "status": "queued",
      "version": 1,
      "taskVersion": 1,
      "authEpoch": 0,
      "createdAt": 1000,
      "updatedAt": 1000
    },
    {
      "ownerRef": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
      "workspaceRef": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
      "taskRef": "9f0d4e239ab575c9f8174aec1e1497f6771298ddf3702458fa232c36d2155ab8",
      "status": "queued",
      "version": 1,
      "taskVersion": 1,
      "authEpoch": 0,
      "createdAt": 1000,
      "updatedAt": 1000
    }
  ],
  "taskStatusInitial": {
    "task": {
      "ownerRef": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
      "workspaceRef": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "status": "queued",
      "version": 1,
      "taskVersion": 1,
      "authEpoch": 0,
      "createdAt": 1000,
      "updatedAt": 1000
    },
    "data": [],
    "actions": [],
    "workers": [],
    "control": "active"
  },
  "taskStatusAfterPrepare": {
    "task": {
      "ownerRef": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
      "workspaceRef": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "status": "queued",
      "version": 2,
      "taskVersion": 2,
      "authEpoch": 0,
      "createdAt": 1000,
      "updatedAt": 1000
    },
    "data": [],
    "actions": [],
    "workers": [],
    "control": "active"
  },
  "taskStatusAfterGrantAndCreate": {
    "task": {
      "ownerRef": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
      "workspaceRef": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "status": "queued",
      "version": 2,
      "taskVersion": 2,
      "authEpoch": 1,
      "createdAt": 1000,
      "updatedAt": 1000
    },
    "data": [],
    "actions": [],
    "workers": [
      {
        "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
        "actionRef": "76ef9445e321532b0e1ce69803423ff2ba82d7d01be6c0952665248c05f011a6",
        "actionDigest": "b9589e35bc515263e4f2919fabfd1563163aa098a5f128c002fe38ceb5b28488",
        "claimRef": "a3daf11862d74095f5abae2fc06d4626be834cf024acde7ca35e3b7a6d1e92d2",
        "reservationRef": "ce34bec9ee921b334be42fe271fea0fc740e7f6408dfc1613edc7ac3053be8a2",
        "generationRef": "1accb6dd9fcf5f7448e1970620b5fe12c03c8f10150e56744e931784e7a68389",
        "sessionRef": "02075246346b062786c89440217f7267f6b6bdd71424ec24e1d849096e3d7e80",
        "phase": "ready"
      }
    ],
    "control": "active"
  },
  "prepareContext": {
    "recordRef": "475554c0cfa10aa5e1f5a44937a1d1b60205738c3d0aa7a57cfcf343bdbc3be4",
    "digest": "5458bfbd0f644877b5ae3983a0f19bf0c3cda344113f41a2f066c2e5b52cc2d8",
    "kind": "context",
    "byteLength": 27,
    "cryptoVersion": 2,
    "sourceRef": "3c51ee67af29d03cd6782147e47fce88bdcad32be3d39c4817a30707a7306ee3",
    "task": {
      "ownerRef": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
      "workspaceRef": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "status": "queued",
      "version": 2,
      "taskVersion": 2,
      "authEpoch": 0,
      "createdAt": 1000,
      "updatedAt": 1000
    },
    "sourceTaskVersion": 1,
    "sourceAuthEpoch": 0,
    "memory": {
      "namespaceRef": "b9181c8d965c324cfd8bff866c017c1291db9710092fb7bbb58a0a47988d5499",
      "revision": 0
    },
    "inputCounts": {
      "bytes": 27,
      "tokens": 27
    },
    "retainedRefs": [],
    "droppedRefs": [],
    "verification": "module_prepared_execution_context_only"
  },
  "workerPlan": {
    "actionRef": "76ef9445e321532b0e1ce69803423ff2ba82d7d01be6c0952665248c05f011a6",
    "actionDigest": "b9589e35bc515263e4f2919fabfd1563163aa098a5f128c002fe38ceb5b28488",
    "taskVersion": 2,
    "authEpoch": 0
  },
  "workerPreview": {
    "previewRef": "2b4526a450e1a92cc0b7ee9f1fe19d5c11787714e1dc777eb2c713bb82fd2e2f",
    "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
    "actionRef": "76ef9445e321532b0e1ce69803423ff2ba82d7d01be6c0952665248c05f011a6",
    "actionDigest": "b9589e35bc515263e4f2919fabfd1563163aa098a5f128c002fe38ceb5b28488",
    "taskVersion": 2,
    "authEpoch": 0,
    "expiresAt": 30000,
    "description": {
      "kind": "write",
      "role": "worker",
      "targetLabel": "UNIT_ONLY selected worker",
      "data": {
        "recordRef": "475554c0cfa10aa5e1f5a44937a1d1b60205738c3d0aa7a57cfcf343bdbc3be4",
        "digest": "5458bfbd0f644877b5ae3983a0f19bf0c3cda344113f41a2f066c2e5b52cc2d8",
        "kind": "context",
        "content": "UNIT_ONLY prepared context"
      },
      "model": {
        "provider": "UNIT_ONLY-provider",
        "model": "UNIT_ONLY-model",
        "reasoning": "native default",
        "preset": "UNIT_ONLY-preset"
      },
      "toolNames": [],
      "environment": {
        "label": "UNIT_ONLY environment",
        "cwd": "/tmp/UNIT_ONLY/df-ui-worker-r2",
        "environmentRef": "67a8f14b46e42dc242965eb1d0b48165b35cd1c226bbd09db1764bdce7cefb0b"
      },
      "limits": {
        "units": 1,
        "attemptIndex": 1,
        "charges": {
          "runtimeMs": 0,
          "usageUnits": 0,
          "costEstimateMicros": 0,
          "costState": "estimated",
          "costProvenanceRef": "3c51ee67af29d03cd6782147e47fce88bdcad32be3d39c4817a30707a7306ee3"
        }
      },
      "evidenceRef": "3c51ee67af29d03cd6782147e47fce88bdcad32be3d39c4817a30707a7306ee3"
    }
  },
  "workerGrant": {
    "task": {
      "ownerRef": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
      "workspaceRef": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "status": "queued",
      "version": 2,
      "taskVersion": 2,
      "authEpoch": 1,
      "createdAt": 1000,
      "updatedAt": 1000
    },
    "taskVersion": 2,
    "authEpoch": 1,
    "actionRef": "76ef9445e321532b0e1ce69803423ff2ba82d7d01be6c0952665248c05f011a6",
    "actionDigest": "b9589e35bc515263e4f2919fabfd1563163aa098a5f128c002fe38ceb5b28488",
    "expiresAt": 20000
  },
  "workerCreate": {
    "task": {
      "ownerRef": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
      "workspaceRef": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "status": "queued",
      "version": 2,
      "taskVersion": 2,
      "authEpoch": 1,
      "createdAt": 1000,
      "updatedAt": 1000
    },
    "worker": {
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "actionRef": "76ef9445e321532b0e1ce69803423ff2ba82d7d01be6c0952665248c05f011a6",
      "actionDigest": "b9589e35bc515263e4f2919fabfd1563163aa098a5f128c002fe38ceb5b28488",
      "claimRef": "a3daf11862d74095f5abae2fc06d4626be834cf024acde7ca35e3b7a6d1e92d2",
      "reservationRef": "ce34bec9ee921b334be42fe271fea0fc740e7f6408dfc1613edc7ac3053be8a2",
      "generationRef": "1accb6dd9fcf5f7448e1970620b5fe12c03c8f10150e56744e931784e7a68389",
      "sessionRef": "02075246346b062786c89440217f7267f6b6bdd71424ec24e1d849096e3d7e80",
      "phase": "ready"
    }
  },
  "workerQueryReady": {
    "task": {
      "ownerRef": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
      "workspaceRef": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "status": "queued",
      "version": 2,
      "taskVersion": 2,
      "authEpoch": 1,
      "createdAt": 1000,
      "updatedAt": 1000
    },
    "worker": {
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "actionRef": "76ef9445e321532b0e1ce69803423ff2ba82d7d01be6c0952665248c05f011a6",
      "actionDigest": "b9589e35bc515263e4f2919fabfd1563163aa098a5f128c002fe38ceb5b28488",
      "claimRef": "a3daf11862d74095f5abae2fc06d4626be834cf024acde7ca35e3b7a6d1e92d2",
      "reservationRef": "ce34bec9ee921b334be42fe271fea0fc740e7f6408dfc1613edc7ac3053be8a2",
      "generationRef": "1accb6dd9fcf5f7448e1970620b5fe12c03c8f10150e56744e931784e7a68389",
      "sessionRef": "02075246346b062786c89440217f7267f6b6bdd71424ec24e1d849096e3d7e80",
      "phase": "ready"
    }
  },
  "workerExecuteUnknown": {
    "task": {
      "ownerRef": "813c3fc5eba3ae33beb09d4da366bbf229045ecf88c290c6ddf68773743177db",
      "workspaceRef": "a3e2d0ff70ce39fdee5693707043caaaf8b319fc63bf61cb7dcc9f89c2ae3969",
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "status": "queued",
      "version": 2,
      "taskVersion": 2,
      "authEpoch": 1,
      "createdAt": 1000,
      "updatedAt": 1000
    },
    "worker": {
      "taskRef": "6edbe7face56b4630c124685104bbe73ef60079fcd690bb35311b0c589e0f73f",
      "actionRef": "76ef9445e321532b0e1ce69803423ff2ba82d7d01be6c0952665248c05f011a6",
      "actionDigest": "b9589e35bc515263e4f2919fabfd1563163aa098a5f128c002fe38ceb5b28488",
      "claimRef": "a3daf11862d74095f5abae2fc06d4626be834cf024acde7ca35e3b7a6d1e92d2",
      "reservationRef": "ce34bec9ee921b334be42fe271fea0fc740e7f6408dfc1613edc7ac3053be8a2",
      "generationRef": "1accb6dd9fcf5f7448e1970620b5fe12c03c8f10150e56744e931784e7a68389",
      "sessionRef": "02075246346b062786c89440217f7267f6b6bdd71424ec24e1d849096e3d7e80",
      "phase": "ready"
    },
    "execution": {
      "executionRef": "bccf6253135f5e207ad76e358e6610b53e69fe838e685000d22dc0cc95934fba",
      "state": "unknown",
      "cursor": null,
      "resultDigest": null,
      "usage": {
        "state": "unknown",
        "units": null,
        "accounting": null
      }
    }
  },
  "resultEnvelope": "Each exact literal row is wrapped {ok:true,value:row}; failure uses original {ok:false,error:{code}}. No extra acknowledgement/effect/nonapplication fields are invented.",
  "taskStatusDataPartition": "data:[] is the independent declared UNIT_ONLY shape. It avoids optional detail calls; it is not a real persisted-context metadata/ledger or permission claim."
};
export const clone = value => structuredClone(value);
export const ok = value => ({ok:true,value:clone(value)});
