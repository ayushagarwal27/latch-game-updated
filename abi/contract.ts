/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/contract.json`.
 */
export type Contract = {
  "address": "EjhoLdwKGbvpp3ydY8nSFq89r4aJBswUeaXWZXX5tW8b",
  "metadata": {
    "name": "contract",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "claimTimeout",
      "discriminator": [
        130,
        234,
        45,
        53,
        120,
        90,
        86,
        178
      ],
      "accounts": [
        {
          "name": "claimant",
          "writable": true,
          "signer": true
        },
        {
          "name": "battleState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  116,
                  116,
                  108,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "battleId"
              }
            ]
          }
        },
        {
          "name": "playerB",
          "writable": true,
          "optional": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "battleId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "battleId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "createBattle",
      "discriminator": [
        2,
        249,
        54,
        216,
        42,
        99,
        187,
        102
      ],
      "accounts": [
        {
          "name": "playerA",
          "writable": true,
          "signer": true
        },
        {
          "name": "battleState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  116,
                  116,
                  108,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "battleId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "battleId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "battleId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "scene",
          "type": "u8"
        },
        {
          "name": "wagerLamports",
          "type": "u64"
        },
        {
          "name": "deadlineUnix",
          "type": "i64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "deployer"
              }
            ]
          }
        },
        {
          "name": "deployer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "admin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "joinBattle",
      "discriminator": [
        126,
        0,
        69,
        130,
        127,
        145,
        54,
        100
      ],
      "accounts": [
        {
          "name": "playerB",
          "writable": true,
          "signer": true
        },
        {
          "name": "battleState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  116,
                  116,
                  108,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "battleId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "battleId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "battleId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "settleBattle",
      "discriminator": [
        4,
        146,
        32,
        157,
        82,
        216,
        214,
        28
      ],
      "accounts": [
        {
          "name": "config"
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "battleState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  116,
                  116,
                  108,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "battleId"
              }
            ]
          }
        },
        {
          "name": "winner",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "battleId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "battleId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "battleState",
      "discriminator": [
        106,
        85,
        43,
        49,
        97,
        18,
        43,
        245
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "battleNotWaiting",
      "msg": "Battle is not waiting for players"
    },
    {
      "code": 6001,
      "name": "battleExpired",
      "msg": "Battle expired"
    },
    {
      "code": 6002,
      "name": "battleNotReady",
      "msg": "Not a Live match"
    },
    {
      "code": 6003,
      "name": "winnerAccountNotPlayer",
      "msg": "Winner dont match player"
    },
    {
      "code": 6004,
      "name": "accountNotPlayer",
      "msg": "this account is not  player of this battle"
    },
    {
      "code": 6005,
      "name": "battleConcluded",
      "msg": "Match is concluded"
    }
  ],
  "types": [
    {
      "name": "battleState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "battleId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "scene",
            "type": "u8"
          },
          {
            "name": "playerA",
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "wagerLamports",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "battleStatus"
              }
            }
          },
          {
            "name": "winner",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "deadlineUnix",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "battleStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "waiting"
          },
          {
            "name": "ready"
          },
          {
            "name": "resolved"
          },
          {
            "name": "refunded"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
