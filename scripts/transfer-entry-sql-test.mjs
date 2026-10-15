import {readFileSync} from 'node:fs';
import {loadLinkedProject,runSqlCheck} from './lib/supabase-project.mjs';
const migration=process.argv.includes('--deployed')?'':readFileSync('supabase/migrations/0035_transfer_entry_history_and_proofs.sql','utf8');
const project=loadLinkedProject(),query='begin;\n'+migration+'\n'+readFileSync('scripts/transfer-entry-cases.sql','utf8')+(process.argv.includes('--mvp')?'\n'+readFileSync('scripts/mvp-exports-account-cases.sql','utf8'):'')+"\nrollback;select 'PASS transfer entry safeguards' result;";
await runSqlCheck(project,query,'PASS transfer entry safeguards');
