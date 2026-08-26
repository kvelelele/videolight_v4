# Review package
BASE: a28db6d7525beb441127cf8ec99eede1b5d59158
HEAD: e75033ea56749980515c81dfadae7e7c480a5e18

## Commits
`
e75033e fix(tracker): document reset monotonic IDs and copy input bboxes
31aac19 feat: add SORT-like client tracker with vitest
`

## Stat
`
 .superpowers/sdd/task-1-report.md |  98 ++++++++++
 package-lock.json                 | 378 +++++++++++++++++++++++++++++++++++++-
 package.json                      |   7 +-
 src/lib/tracker.test.ts           |  58 ++++++
 src/lib/tracker.ts                | 157 ++++++++++++++++
 vite.config.ts                    |   4 +
 6 files changed, 699 insertions(+), 3 deletions(-)
`

## Diff
`diff
diff --git a/.superpowers/sdd/task-1-report.md b/.superpowers/sdd/task-1-report.md
new file mode 100644
index 0000000..1db2f9d
--- /dev/null
+++ b/.superpowers/sdd/task-1-report.md
@@ -0,0 +1,98 @@
+# Task 1 Report: Vitest + SORT-like tracker
+
+## What was implemented
+
+- Added **Vitest** (`vitest@^4.1.11`) as a dev dependency with `test` and `test:watch` npm scripts.
+- Configured Vitest in `vite.config.ts` (node environment, `src/**/*.test.ts` include pattern).
+- Created **`SortTracker`** вЂ” a pure TypeScript SORT-like multi-object tracker in `src/lib/tracker.ts`:
+  - IoU-based greedy assignment
+  - Constant-velocity prediction on bbox center + size
+  - Configurable `iouThreshold`, `maxAgeMs`, `minHits`
+  - `reset()` clears active tracks and timestamp state
+- Added 4 unit tests in `src/lib/tracker.test.ts` covering stable IDs, minHits gating, maxAge expiry, and reset behavior.
+
+**Not changed:** `tsconfig.json` вЂ” per resolution, explicit `import { describe, it, expect } from 'vitest'` used instead of `types: ["vitest/globals"]`.
+
+## TDD evidence
+
+### RED (Step 3)
+
+**Command:**
+```bash
+npm test
+```
+
+**Output:**
+```
+ FAIL  src/lib/tracker.test.ts [ src/lib/tracker.test.ts ]
+Error: Cannot find module './tracker' imported from C:/DevPrj/videolight_v4/src/lib/tracker.test.ts
+ вќЇ src/lib/tracker.test.ts:2:1
+      1| import { describe, expect, it } from 'vitest';
+      2| import { SortTracker } from './tracker';
+       | ^
+
+ Test Files  1 failed (1)
+      Tests  no tests
+```
+
+Tests could not run because `tracker.ts` did not exist yet вЂ” expected RED.
+
+### GREEN (Step 5)
+
+**Command:**
+```bash
+npm test
+```
+
+**Output:**
+```
+ Test Files  1 passed (1)
+      Tests  4 passed (4)
+   Duration  294ms
+```
+
+All 4 tracker tests pass.
+
+## Files changed
+
+| File | Action |
+|------|--------|
+| `package.json` | Modified вЂ” added vitest dep + test scripts |
+| `package-lock.json` | Modified вЂ” lockfile update |
+| `vite.config.ts` | Modified вЂ” vitest config block |
+| `src/lib/tracker.ts` | Created вЂ” SortTracker implementation |
+| `src/lib/tracker.test.ts` | Created вЂ” 4 unit tests |
+
+## Self-review
+
+1. **Single filter applied** вЂ” return uses one `tr.hits >= this.minHits` filter (not the redundant double-filter from the plan snippet).
+2. **BBox copies** вЂ” returned bboxes use `[...tr.bbox] as TrackBBox` to avoid aliasing internal state.
+3. **reset() deviation** вЂ” plan snippet resets `nextId = 1`, but the verbatim test `reset clears ids` requires the post-reset track ID to differ from the pre-reset ID. Implemented reset clears `tracks` and `lastTs` only, leaving `nextId` monotonic. This matches test intent ("clears ids" = fresh assignment, not counter rewind).
+4. **No globals** вЂ” tests import explicitly from `vitest`; no tsconfig types pollution.
+5. **Scope** вЂ” no MediaPipe worker, React hook, or UI integration (deferred to later tasks as specified).
+
+## Concerns
+
+1. **Plan vs test inconsistency on `reset()`** вЂ” brief implementation sets `nextId = 1` on reset, but the acceptance test fails with that behavior. Current implementation follows the test; downstream consumers should not assume IDs restart at 1 after reset.
+2. **Greedy IoU matching** вЂ” not optimal assignment (Hungarian); acceptable for MVP but may swap IDs when tracks cross closely.
+3. **No class-aware matching** вЂ” tracks match purely on IoU; different-class overlap could cause ID handoff (unlikely in typical person/car scenes with non-overlapping classes).
+
+## Review fix (Important findings)
+
+**Changes:**
+1. Added one-line JSDoc on `SortTracker.reset()` documenting that track IDs stay monotonic (`nextId` is not reset to 1).
+2. Defensive-copy detection bboxes when storing into internal tracks on IoU match and on new track spawn (`[...det.bbox] as TrackBBox`), so caller mutations to `det.bbox` cannot corrupt tracker state. Return path already copied bboxes.
+
+**Command:**
+```bash
+npm test
+```
+
+**Output:**
+```
+ Test Files  1 passed (1)
+      Tests  4 passed (4)
+   Duration  360ms
+```
+
+All 4 tracker tests pass after review fixes.
diff --git a/package-lock.json b/package-lock.json
index 970938a..5d43ab6 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -10,21 +10,22 @@
         "react": "19.2.8",
         "react-dom": "19.2.8"
       },
       "devDependencies": {
         "@tailwindcss/vite": "^4.3.3",
         "@types/react": "^19.2.17",
         "@types/react-dom": "^19.2.3",
         "@vitejs/plugin-react": "^6.0.4",
         "tailwindcss": "^4.3.3",
         "typescript": "~5.6.3",
-        "vite": "^8.1.5"
+        "vite": "^8.1.5",
+        "vitest": "^4.1.11"
       }
     },
     "node_modules/@jridgewell/gen-mapping": {
       "version": "0.3.13",
       "resolved": "https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.13.tgz",
       "integrity": "sha512-2kkt/7niJ6MgEPxF0bYdQ6etZaA+fQvDcLKckhy1yIQOzaoKjBBjSj63/aLVjYE3qhRt5dvM+uUyfCg6UKCBbA==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "@jridgewell/sourcemap-codec": "^1.5.0",
@@ -335,20 +336,27 @@
         "node": "^20.19.0 || >=22.12.0"
       }
     },
     "node_modules/@rolldown/pluginutils": {
       "version": "1.0.1",
       "resolved": "https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.1.tgz",
       "integrity": "sha512-2j9bGt5Jh8hj+vPtgzPtl72j0yRxHAyumoo6TNfAjsLB04UtpSvPbPcDcBMxz7n+9CYB0c1GxQFxYRg2jimqGw==",
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/@standard-schema/spec": {
+      "version": "1.1.0",
+      "resolved": "https://registry.npmjs.org/@standard-schema/spec/-/spec-1.1.0.tgz",
+      "integrity": "sha512-l2aFy5jALhniG5HgqrD6jXLi/rUWrKvqN/qJx6yoJsgKhblVd+iqqU4RCXavm/jPityDo5TCvKMnpjKnOriy0w==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/@tailwindcss/node": {
       "version": "4.3.3",
       "resolved": "https://registry.npmjs.org/@tailwindcss/node/-/node-4.3.3.tgz",
       "integrity": "sha512-/T8IKEsf9VTU6tLjgC7+sv2mOPtQxzE2jMw7u4Tt40Tx+QSZxpzh95/H6cMKoja9XuW7iMdLJYBB0o9G1CaAgg==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "@jridgewell/remapping": "^2.3.5",
         "enhanced-resolve": "^5.24.1",
         "jiti": "^2.7.0",
@@ -607,20 +615,45 @@
       "license": "MIT",
       "dependencies": {
         "@tailwindcss/node": "4.3.3",
         "@tailwindcss/oxide": "4.3.3",
         "tailwindcss": "4.3.3"
       },
       "peerDependencies": {
         "vite": "^5.2.0 || ^6 || ^7 || ^8"
       }
     },
+    "node_modules/@types/chai": {
+      "version": "5.2.3",
+      "resolved": "https://registry.npmjs.org/@types/chai/-/chai-5.2.3.tgz",
+      "integrity": "sha512-Mw558oeA9fFbv65/y4mHtXDs9bPnFMZAL/jxdPFUpOHHIXX91mcgEHbS5Lahr+pwZFR8A7GQleRWeI6cGFC2UA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@types/deep-eql": "*",
+        "assertion-error": "^2.0.1"
+      }
+    },
+    "node_modules/@types/deep-eql": {
+      "version": "4.0.2",
+      "resolved": "https://registry.npmjs.org/@types/deep-eql/-/deep-eql-4.0.2.tgz",
+      "integrity": "sha512-c9h9dVVMigMPc4bwTvC5dxqtqJZwQPePsWjPlpSOnojbor6pGqdk541lfA7AqFQr5pB1BRdq0juY9db81BwyFw==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/@types/estree": {
+      "version": "1.0.9",
+      "resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.9.tgz",
+      "integrity": "sha512-GhdPgy1el4/ImP05X05Uw4cw2/M93BCUmnEvWZNStlCzEKME4Fkk+YpoA5OiHNQmoS7Cafb8Xa3Pya8m1Qrzeg==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/@types/react": {
       "version": "19.2.18",
       "resolved": "https://registry.npmjs.org/@types/react/-/react-19.2.18.tgz",
       "integrity": "sha512-AnzbBERsrLKtk2XSfTbYRLjQPdy116Sty4q+T+Bp3IC4l6jNBvreVPAHmpq9qhXQM7CXZPjLVmGMw9sy+hxQ3w==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "csstype": "^3.2.2"
       }
     },
@@ -657,20 +690,160 @@
           "optional": true
         },
         "babel-plugin-react-compiler": {
           "optional": true
         },
         "oxc-transform-react": {
           "optional": true
         }
       }
     },
+    "node_modules/@vitest/expect": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/expect/-/expect-4.1.11.tgz",
+      "integrity": "sha512-VX2x5vNJXET47KAFzwERI+KRMtTTCSWTfSMKsW7JsUsXV4psq++e3DvZpuTDOpHcxytiDs6p2nhVb2tVDiiUYw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@standard-schema/spec": "^1.1.0",
+        "@types/chai": "^5.2.2",
+        "@vitest/spy": "4.1.11",
+        "@vitest/utils": "4.1.11",
+        "chai": "^6.2.2",
+        "tinyrainbow": "^3.1.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/mocker": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/mocker/-/mocker-4.1.11.tgz",
+      "integrity": "sha512-2XJVD55d1o5AZous5CCGKS74g/riOj9odEt2bQpCVZeblHyHdnMeFl4jl0XjU21stf4mbjUkew2eXQZt65g5CQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@vitest/spy": "4.1.11",
+        "estree-walker": "^3.0.3",
+        "magic-string": "^0.30.21"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      },
+      "peerDependencies": {
+        "msw": "^2.4.9",
+        "vite": "^6.0.0 || ^7.0.0 || ^8.0.0"
+      },
+      "peerDependenciesMeta": {
+        "msw": {
+          "optional": true
+        },
+        "vite": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/@vitest/pretty-format": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/pretty-format/-/pretty-format-4.1.11.tgz",
+      "integrity": "sha512-yiZzPbGTS9Sr/JpFl8zHrcIkAofNbFV6k21vIgQN/cY/oxZeXhJv5sc/MBJ5jFKWmWs+oJHw0UXLZjmf931+Vw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "tinyrainbow": "^3.1.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/runner": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/runner/-/runner-4.1.11.tgz",
+      "integrity": "sha512-LztvUgdwMNJMIkj3hQnnxiC2Xy1zNxq928W/xhjCLaNCzqTZOudjwbQf6v9IntZGPw132i2Lq2rgTRZHD3JHNw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@vitest/utils": "4.1.11",
+        "pathe": "^2.0.3"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/snapshot": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/snapshot/-/snapshot-4.1.11.tgz",
+      "integrity": "sha512-pN7ikn1ON7h8ee4gIAp4AzyK+zBtJPzVbqOgu5LCEh4VaJVbPQcgYQYJIMGQPXVeJJq1fnfazis7a5pFNPahog==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@vitest/pretty-format": "4.1.11",
+        "@vitest/utils": "4.1.11",
+        "magic-string": "^0.30.21",
+        "pathe": "^2.0.3"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/spy": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/spy/-/spy-4.1.11.tgz",
+      "integrity": "sha512-apNa/prQy2qCeywhnixOHPRCgGNhvg7T4Dapfl1GahLp/R+uhBm5cPyFoNVyqsNd2h1nJxL6BqqdIjiABL60YA==",
+      "dev": true,
+      "license": "MIT",
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/@vitest/utils": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/@vitest/utils/-/utils-4.1.11.tgz",
+      "integrity": "sha512-zTCVGpyFsGWBhllOyKlTw/vnr6D9qxsfSDyfbyZmTyjHw5N/VuvzHpHoQjm2ZJzn4RJgx5w4r7V0er69CmLgPQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@vitest/pretty-format": "4.1.11",
+        "convert-source-map": "^2.0.0",
+        "tinyrainbow": "^3.1.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      }
+    },
+    "node_modules/assertion-error": {
+      "version": "2.0.1",
+      "resolved": "https://registry.npmjs.org/assertion-error/-/assertion-error-2.0.1.tgz",
+      "integrity": "sha512-Izi8RQcffqCeNVgFigKli1ssklIbpHnCYc6AknXGYoB6grJqyeby7jv12JUQgmTAnIDnbck1uxksT4dzN3PWBA==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/chai": {
+      "version": "6.2.2",
+      "resolved": "https://registry.npmjs.org/chai/-/chai-6.2.2.tgz",
+      "integrity": "sha512-NUPRluOfOiTKBKvWPtSD4PhFvWCqOi0BGStNWs57X9js7XGTprSmFoz5F0tWhR4WPjNeR9jXqdC7/UpSJTnlRg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/convert-source-map": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz",
+      "integrity": "sha512-Kvp459HrV2FEJ1CAsi1Ku+MY3kasH19TFykTz2xWmMeq6bk2NU3XXvfJ+Q61m0xktWwt+1HSYf3JZsTms3aRJg==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/csstype": {
       "version": "3.2.3",
       "resolved": "https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz",
       "integrity": "sha512-z1HGKcYy2xA8AGQfwrn0PAy+PB7X/GSj3UVJW9qKyn43xWa+gl5nXmU4qqLMRzWVLFC8KusUX8T/0kCiOYpAIQ==",
       "dev": true,
       "license": "MIT"
     },
     "node_modules/detect-libc": {
       "version": "2.1.2",
       "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
@@ -688,20 +861,47 @@
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "graceful-fs": "^4.2.4",
         "tapable": "^2.3.3"
       },
       "engines": {
         "node": ">=10.13.0"
       }
     },
+    "node_modules/es-module-lexer": {
+      "version": "2.3.2",
+      "resolved": "https://registry.npmjs.org/es-module-lexer/-/es-module-lexer-2.3.2.tgz",
+      "integrity": "sha512-poHGpORABojJJucnV9KbOavETW8lBVnphkW77ER5/BQ5Fz7oXSoCNek7IH3vR5nRjdsEz926ibFYX8KtLQmdyw==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/estree-walker": {
+      "version": "3.0.3",
+      "resolved": "https://registry.npmjs.org/estree-walker/-/estree-walker-3.0.3.tgz",
+      "integrity": "sha512-7RUKfXgSMMkzt6ZuXmqapOurLGPPfgj6l9uRZ7lRGolvk0y2yocc35LdcxKC5PQZdn2DMqioAQ2NoWcrTKmm6g==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@types/estree": "^1.0.0"
+      }
+    },
+    "node_modules/expect-type": {
+      "version": "1.4.0",
+      "resolved": "https://registry.npmjs.org/expect-type/-/expect-type-1.4.0.tgz",
+      "integrity": "sha512-KfYbmpRm0VbLjEvVa9yGwCi9GI34xvi7A/HXYWQO65CSD2u3MczUJSuwXKFIxlGsgBQizV9q5J9NHj4VG0n+pA==",
+      "dev": true,
+      "license": "Apache-2.0",
+      "engines": {
+        "node": ">=12.0.0"
+      }
+    },
     "node_modules/fdir": {
       "version": "6.5.0",
       "resolved": "https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz",
       "integrity": "sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=12.0.0"
       },
       "peerDependencies": {
@@ -1034,20 +1234,41 @@
         }
       ],
       "license": "MIT",
       "bin": {
         "nanoid": "bin/nanoid.cjs"
       },
       "engines": {
         "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
       }
     },
+    "node_modules/obug": {
+      "version": "2.1.4",
+      "resolved": "https://registry.npmjs.org/obug/-/obug-2.1.4.tgz",
+      "integrity": "sha512-4a+OsYv9UktOJKE+l1A4OufDgdRF9PifWj+tJnHURo/P+WOxpG4GzUFL9qCalmWauao6ogiG+QvnCovwPoyAWA==",
+      "dev": true,
+      "funding": [
+        "https://github.com/sponsors/sxzz",
+        "https://opencollective.com/debug"
+      ],
+      "license": "MIT",
+      "engines": {
+        "node": ">=12.20.0"
+      }
+    },
+    "node_modules/pathe": {
+      "version": "2.0.3",
+      "resolved": "https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz",
+      "integrity": "sha512-WUjGcAqP1gQacoQe+OBJsFA7Ld4DyXuUIjZ5cc75cLHvJ7dtNsTugphxIADwspS+AraAUePCKrSVtPLFj/F88w==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/picocolors": {
       "version": "1.1.1",
       "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
       "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
       "dev": true,
       "license": "ISC"
     },
     "node_modules/picomatch": {
       "version": "4.0.7",
       "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz",
@@ -1144,30 +1365,51 @@
         "@rolldown/binding-win32-arm64-msvc": "1.2.5",
         "@rolldown/binding-win32-x64-msvc": "1.2.5"
       }
     },
     "node_modules/scheduler": {
       "version": "0.27.0",
       "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz",
       "integrity": "sha512-eNv+WrVbKu1f3vbYJT/xtiF5syA5HPIMtf9IgY/nKg0sWqzAUEvqY/xm7OcZc/qafLx/iO9FgOmeSAp4v5ti/Q==",
       "license": "MIT"
     },
+    "node_modules/siginfo": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/siginfo/-/siginfo-2.0.0.tgz",
+      "integrity": "sha512-ybx0WO1/8bSBLEWXZvEd7gMW3Sn3JFlW3TvX1nREbDLRNQNaeNN8WK0meBwPdAaOI7TtRRRJn/Es1zhrrCHu7g==",
+      "dev": true,
+      "license": "ISC"
+    },
     "node_modules/source-map-js": {
       "version": "1.2.1",
       "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
       "integrity": "sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==",
       "dev": true,
       "license": "BSD-3-Clause",
       "engines": {
         "node": ">=0.10.0"
       }
     },
+    "node_modules/stackback": {
+      "version": "0.0.2",
+      "resolved": "https://registry.npmjs.org/stackback/-/stackback-0.0.2.tgz",
+      "integrity": "sha512-1XMJE5fQo1jGH6Y/7ebnwPOBEkIEnT4QF32d5R1+VXdXveM0IBMJt8zfaxX1P3QhVwrYe+576+jkANtSS2mBbw==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/std-env": {
+      "version": "4.2.0",
+      "resolved": "https://registry.npmjs.org/std-env/-/std-env-4.2.0.tgz",
+      "integrity": "sha512-oCUKSupKTHX53EyjDtuZQ64pjLJ6yYCtpmEw0goYxtjG9KpbRe8KAsl2tBUGU9DyMcJ0RwJ8GqJAFzMXcXW1Rw==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/tailwindcss": {
       "version": "4.3.3",
       "resolved": "https://registry.npmjs.org/tailwindcss/-/tailwindcss-4.3.3.tgz",
       "integrity": "sha512-gOhV3P7ufE62QDGg1zVaTgCR+EtPv92k2nIhVcVKcLmxT1sUBsQGhnZj175j+MqRt4zLF7ic+sCYjfhxMxj7YQ==",
       "dev": true,
       "license": "MIT"
     },
     "node_modules/tapable": {
       "version": "2.3.3",
       "resolved": "https://registry.npmjs.org/tapable/-/tapable-2.3.3.tgz",
@@ -1175,37 +1417,64 @@
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6"
       },
       "funding": {
         "type": "opencollective",
         "url": "https://opencollective.com/webpack"
       }
     },
+    "node_modules/tinybench": {
+      "version": "2.9.0",
+      "resolved": "https://registry.npmjs.org/tinybench/-/tinybench-2.9.0.tgz",
+      "integrity": "sha512-0+DUvqWMValLmha6lr4kD8iAMK1HzV0/aKnCtWb9v9641TnP/MFb7Pc2bxoxQjTXAErryXVgUOfv2YqNllqGeg==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/tinyexec": {
+      "version": "1.3.0",
+      "resolved": "https://registry.npmjs.org/tinyexec/-/tinyexec-1.3.0.tgz",
+      "integrity": "sha512-QKAl9m8gWWGHV8jZcPeym6j+XULi6tOf1mT83WYJ4Lk2ytW/uwAWkrP0uFsdoYMdueVJ0qs26wZ+23xeB4ibNQ==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      }
+    },
     "node_modules/tinyglobby": {
       "version": "0.2.17",
       "resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz",
       "integrity": "sha512-wXR/dYpcqKmfWpEdZjiKJOwCNFndD0DMnrW/cYjVGttEkBfVgcLFHoNrlj47mjOVic9yyNu65alsgF4NQyTa2g==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "fdir": "^6.5.0",
         "picomatch": "^4.0.4"
       },
       "engines": {
         "node": ">=12.0.0"
       },
       "funding": {
         "url": "https://github.com/sponsors/SuperchupuDev"
       }
     },
+    "node_modules/tinyrainbow": {
+      "version": "3.1.1",
+      "resolved": "https://registry.npmjs.org/tinyrainbow/-/tinyrainbow-3.1.1.tgz",
+      "integrity": "sha512-yau8yJdTt989Mm0Bd/236QnzEiPf2xLLTqUZRUJOo/3CB078LSwzei343DgtJVmfJKJE3TMINY1u42SQsP6mXw==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=14.0.0"
+      }
+    },
     "node_modules/typescript": {
       "version": "5.6.3",
       "resolved": "https://registry.npmjs.org/typescript/-/typescript-5.6.3.tgz",
       "integrity": "sha512-hjcS1mhfuyi4WW8IWtjP7brDrG2cuDZukyrYrSauoXGNgx0S7zceP07adYkJycEr56BOUTNPzbInooiN3fn1qw==",
       "dev": true,
       "license": "Apache-2.0",
       "bin": {
         "tsc": "bin/tsc",
         "tsserver": "bin/tsserver"
       },
@@ -1544,13 +1813,120 @@
       "os": [
         "win32"
       ],
       "engines": {
         "node": ">= 12.0.0"
       },
       "funding": {
         "type": "opencollective",
         "url": "https://opencollective.com/parcel"
       }
+    },
+    "node_modules/vitest": {
+      "version": "4.1.11",
+      "resolved": "https://registry.npmjs.org/vitest/-/vitest-4.1.11.tgz",
+      "integrity": "sha512-fhACrNXUidIbGSBr5FlbuBkO7VWC1ZyLl0DO4CU2DrQoAPxX84Ysxs+HeGQpii5lZWV1Q4gBZTTu49mF+A6Edw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@vitest/expect": "4.1.11",
+        "@vitest/mocker": "4.1.11",
+        "@vitest/pretty-format": "4.1.11",
+        "@vitest/runner": "4.1.11",
+        "@vitest/snapshot": "4.1.11",
+        "@vitest/spy": "4.1.11",
+        "@vitest/utils": "4.1.11",
+        "es-module-lexer": "^2.0.0",
+        "expect-type": "^1.3.0",
+        "magic-string": "^0.30.21",
+        "obug": "^2.1.1",
+        "pathe": "^2.0.3",
+        "picomatch": "^4.0.3",
+        "std-env": "^4.0.0-rc.1",
+        "tinybench": "^2.9.0",
+        "tinyexec": "^1.0.2",
+        "tinyglobby": "^0.2.15",
+        "tinyrainbow": "^3.1.0",
+        "vite": "^6.0.0 || ^7.0.0 || ^8.0.0",
+        "why-is-node-running": "^2.3.0"
+      },
+      "bin": {
+        "vitest": "vitest.mjs"
+      },
+      "engines": {
+        "node": "^20.0.0 || ^22.0.0 || >=24.0.0"
+      },
+      "funding": {
+        "url": "https://opencollective.com/vitest"
+      },
+      "peerDependencies": {
+        "@edge-runtime/vm": "*",
+        "@opentelemetry/api": "^1.9.0",
+        "@types/node": "^20.0.0 || ^22.0.0 || >=24.0.0",
+        "@vitest/browser-playwright": "4.1.11",
+        "@vitest/browser-preview": "4.1.11",
+        "@vitest/browser-webdriverio": "4.1.11",
+        "@vitest/coverage-istanbul": "4.1.11",
+        "@vitest/coverage-v8": "4.1.11",
+        "@vitest/ui": "4.1.11",
+        "happy-dom": "*",
+        "jsdom": "*",
+        "vite": "^6.0.0 || ^7.0.0 || ^8.0.0"
+      },
+      "peerDependenciesMeta": {
+        "@edge-runtime/vm": {
+          "optional": true
+        },
+        "@opentelemetry/api": {
+          "optional": true
+        },
+        "@types/node": {
+          "optional": true
+        },
+        "@vitest/browser-playwright": {
+          "optional": true
+        },
+        "@vitest/browser-preview": {
+          "optional": true
+        },
+        "@vitest/browser-webdriverio": {
+          "optional": true
+        },
+        "@vitest/coverage-istanbul": {
+          "optional": true
+        },
+        "@vitest/coverage-v8": {
+          "optional": true
+        },
+        "@vitest/ui": {
+          "optional": true
+        },
+        "happy-dom": {
+          "optional": true
+        },
+        "jsdom": {
+          "optional": true
+        },
+        "vite": {
+          "optional": false
+        }
+      }
+    },
+    "node_modules/why-is-node-running": {
+      "version": "2.3.0",
+      "resolved": "https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-2.3.0.tgz",
+      "integrity": "sha512-hUrmaWBdVDcxvYqnyh09zunKzROWjbZTiNy8dBEjkS7ehEDQibXJ7XvlmtbwuTclUiIyN+CyXQD4Vmko8fNm8w==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "siginfo": "^2.0.0",
+        "stackback": "0.0.2"
+      },
+      "bin": {
+        "why-is-node-running": "cli.js"
+      },
+      "engines": {
+        "node": ">=8"
+      }
     }
   }
 }
diff --git a/package.json b/package.json
index af22f30..20d3e7b 100644
--- a/package.json
+++ b/package.json
@@ -1,25 +1,28 @@
 {
   "name": "lovarus-app",
   "private": true,
   "type": "module",
   "scripts": {
     "dev": "vite",
     "dev:api": "cd backend && .venv/Scripts/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000",
     "build": "vite build",
-    "preview": "vite preview"
+    "preview": "vite preview",
+    "test": "vitest run",
+    "test:watch": "vitest"
   },
   "dependencies": {
     "hls.js": "^1.7.1",
     "react": "19.2.8",
     "react-dom": "19.2.8"
   },
   "devDependencies": {
     "@tailwindcss/vite": "^4.3.3",
     "@types/react": "^19.2.17",
     "@types/react-dom": "^19.2.3",
     "@vitejs/plugin-react": "^6.0.4",
     "tailwindcss": "^4.3.3",
     "typescript": "~5.6.3",
-    "vite": "^8.1.5"
+    "vite": "^8.1.5",
+    "vitest": "^4.1.11"
   }
 }
diff --git a/src/lib/tracker.test.ts b/src/lib/tracker.test.ts
new file mode 100644
index 0000000..32a2408
--- /dev/null
+++ b/src/lib/tracker.test.ts
@@ -0,0 +1,58 @@
+import { describe, expect, it } from 'vitest';
+import { SortTracker } from './tracker';
+
+describe('SortTracker', () => {
+  it('assigns stable ids across frames for overlapping boxes', () => {
+    const tracker = new SortTracker({ minHits: 1, maxAgeMs: 750, iouThreshold: 0.3 });
+    const t0 = tracker.update(
+      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
+      0,
+    );
+    expect(t0).toHaveLength(1);
+    const id = t0[0].trackId;
+
+    const t1 = tracker.update(
+      [{ className: 'person', confidence: 0.88, bbox: [12, 12, 52, 82] }],
+      100,
+    );
+    expect(t1).toHaveLength(1);
+    expect(t1[0].trackId).toBe(id);
+  });
+
+  it('hides tracks until minHits', () => {
+    const tracker = new SortTracker({ minHits: 2, maxAgeMs: 750, iouThreshold: 0.3 });
+    const t0 = tracker.update(
+      [{ className: 'car', confidence: 0.8, bbox: [100, 100, 200, 180] }],
+      0,
+    );
+    expect(t0).toHaveLength(0);
+    const t1 = tracker.update(
+      [{ className: 'car', confidence: 0.8, bbox: [102, 100, 202, 180] }],
+      50,
+    );
+    expect(t1).toHaveLength(1);
+  });
+
+  it('drops tracks after maxAgeMs without matches', () => {
+    const tracker = new SortTracker({ minHits: 1, maxAgeMs: 750, iouThreshold: 0.3 });
+    tracker.update([{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }], 0);
+    const still = tracker.update([], 700);
+    expect(still).toHaveLength(1);
+    const gone = tracker.update([], 800);
+    expect(gone).toHaveLength(0);
+  });
+
+  it('reset clears ids', () => {
+    const tracker = new SortTracker({ minHits: 1 });
+    const a = tracker.update(
+      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
+      0,
+    );
+    tracker.reset();
+    const b = tracker.update(
+      [{ className: 'person', confidence: 0.9, bbox: [10, 10, 50, 80] }],
+      10,
+    );
+    expect(b[0].trackId).not.toBe(a[0].trackId);
+  });
+});
diff --git a/src/lib/tracker.ts b/src/lib/tracker.ts
new file mode 100644
index 0000000..de1d0db
--- /dev/null
+++ b/src/lib/tracker.ts
@@ -0,0 +1,157 @@
+export type TrackBBox = [number, number, number, number];
+
+export interface RawDetection {
+  className: string;
+  confidence: number;
+  bbox: TrackBBox;
+}
+
+export interface TrackedObject {
+  trackId: number;
+  className: string;
+  confidence: number;
+  bbox: TrackBBox;
+}
+
+interface TrackerOptions {
+  iouThreshold?: number;
+  maxAgeMs?: number;
+  minHits?: number;
+}
+
+interface InternalTrack {
+  id: number;
+  className: string;
+  confidence: number;
+  bbox: TrackBBox;
+  hits: number;
+  ageMs: number;
+  timeSinceUpdateMs: number;
+  // simple constant-velocity on center + size
+  vx: number;
+  vy: number;
+  vw: number;
+  vh: number;
+}
+
+function iou(a: TrackBBox, b: TrackBBox): number {
+  const x1 = Math.max(a[0], b[0]);
+  const y1 = Math.max(a[1], b[1]);
+  const x2 = Math.min(a[2], b[2]);
+  const y2 = Math.min(a[3], b[3]);
+  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
+  if (inter <= 0) return 0;
+  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
+  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
+  const denom = areaA + areaB - inter;
+  return denom > 0 ? inter / denom : 0;
+}
+
+function centerSize(b: TrackBBox) {
+  const w = b[2] - b[0];
+  const h = b[3] - b[1];
+  return { cx: b[0] + w / 2, cy: b[1] + h / 2, w, h };
+}
+
+function fromCenterSize(cx: number, cy: number, w: number, h: number): TrackBBox {
+  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
+}
+
+export class SortTracker {
+  private iouThreshold: number;
+  private maxAgeMs: number;
+  private minHits: number;
+  private nextId = 1;
+  private tracks: InternalTrack[] = [];
+  private lastTs: number | null = null;
+
+  constructor(opts: TrackerOptions = {}) {
+    this.iouThreshold = opts.iouThreshold ?? 0.3;
+    this.maxAgeMs = opts.maxAgeMs ?? 750;
+    this.minHits = opts.minHits ?? 2;
+  }
+
+  /** Clears active tracks and timestamp state; track IDs remain monotonic (nextId is not reset). */
+  reset(): void {
+    this.tracks = [];
+    this.lastTs = null;
+  }
+
+  update(dets: RawDetection[], nowMs: number): TrackedObject[] {
+    const dt = this.lastTs == null ? 0 : Math.max(0, nowMs - this.lastTs);
+    this.lastTs = nowMs;
+
+    for (const tr of this.tracks) {
+      const { cx, cy, w, h } = centerSize(tr.bbox);
+      const ncx = cx + tr.vx * dt;
+      const ncy = cy + tr.vy * dt;
+      const nw = Math.max(1, w + tr.vw * dt);
+      const nh = Math.max(1, h + tr.vh * dt);
+      tr.bbox = fromCenterSize(ncx, ncy, nw, nh);
+      tr.ageMs += dt;
+      tr.timeSinceUpdateMs += dt;
+    }
+
+    const trackIdx = this.tracks.map((_, i) => i);
+    const detIdx = dets.map((_, i) => i);
+    const pairs: { t: number; d: number; score: number }[] = [];
+    for (const t of trackIdx) {
+      for (const d of detIdx) {
+        const score = iou(this.tracks[t].bbox, dets[d].bbox);
+        if (score >= this.iouThreshold) pairs.push({ t, d, score });
+      }
+    }
+    pairs.sort((a, b) => b.score - a.score);
+
+    const usedT = new Set<number>();
+    const usedD = new Set<number>();
+    for (const p of pairs) {
+      if (usedT.has(p.t) || usedD.has(p.d)) continue;
+      usedT.add(p.t);
+      usedD.add(p.d);
+      const tr = this.tracks[p.t];
+      const det = dets[p.d];
+      const prev = centerSize(tr.bbox);
+      const next = centerSize(det.bbox);
+      const invDt = dt > 0 ? 1 / dt : 0;
+      tr.vx = (next.cx - prev.cx) * invDt;
+      tr.vy = (next.cy - prev.cy) * invDt;
+      tr.vw = (next.w - prev.w) * invDt;
+      tr.vh = (next.h - prev.h) * invDt;
+      tr.bbox = [...det.bbox] as TrackBBox;
+      tr.className = det.className;
+      tr.confidence = det.confidence;
+      tr.hits += 1;
+      tr.timeSinceUpdateMs = 0;
+    }
+
+    for (let d = 0; d < dets.length; d++) {
+      if (usedD.has(d)) continue;
+      const det = dets[d];
+      this.tracks.push({
+        id: this.nextId++,
+        className: det.className,
+        confidence: det.confidence,
+        bbox: [...det.bbox] as TrackBBox,
+        hits: 1,
+        ageMs: 0,
+        timeSinceUpdateMs: 0,
+        vx: 0,
+        vy: 0,
+        vw: 0,
+        vh: 0,
+      });
+    }
+
+    this.tracks = this.tracks.filter((tr) => tr.timeSinceUpdateMs <= this.maxAgeMs);
+
+    return this.tracks
+      .filter((tr) => tr.hits >= this.minHits)
+      .map((tr) => ({
+        trackId: tr.id,
+        className: tr.className,
+        confidence: tr.confidence,
+        bbox: [...tr.bbox] as TrackBBox,
+      }));
+  }
+}
diff --git a/vite.config.ts b/vite.config.ts
index b05dfc1..d4da4de 100644
--- a/vite.config.ts
+++ b/vite.config.ts
@@ -6,11 +6,15 @@ export default defineConfig({
   plugins: [react(), tailwindcss()],
   server: {
     proxy: {
       '/api': {
         target: 'http://127.0.0.1:8000',
         changeOrigin: true,
         ws: true,
       },
     },
   },
+  test: {
+    environment: 'node',
+    include: ['src/**/*.test.ts'],
+  },
 })
`
