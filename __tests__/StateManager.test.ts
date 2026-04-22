// StateManager.test.ts — Root-level aggregator for all StateManager unit tests.
// Exists to (a) satisfy validation.json criterion 4.1.1 (file at this exact path)
// and (b) let `bun test __tests__/StateManager.test.ts` execute the full suite
// by importing each nested test file. Per test-plan §3.1, individual tests live
// under __tests__/StateManager/<subject>.test.ts for per-subject organisation.

import './StateManager/init.test';
import './StateManager/init-pointer.test';
import './StateManager/read.test';
import './StateManager/update-criterion.test';
import './StateManager/advance-task.test';
import './StateManager/advance-task-events.test';
import './StateManager/advance-task-pointer.test';
import './StateManager/show.test';
import './StateManager/validate.test';
import './StateManager/checksum.test';
import './StateManager/help.test';
import './StateManager/exports.test';
import './StateManager/unknown-fields.test';
import './StateManager/path-flag.test';
import './StateManager/atomic-write.test';
import './StateManager/layering.test';
import './StateManager/computePlanChecksum.test';
