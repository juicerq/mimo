import type { MigrationsJournal } from "drizzle-orm/migrator"
import initialSchema from "@drizzle/20260901132949_initial-schema/migration.sql" with { type: "text" }
import routines from "@drizzle/20260901184631_routines/migration.sql" with { type: "text" }
import memory from "@drizzle/20260901200730_memory/migration.sql" with { type: "text" }
import messageImages from "@drizzle/20260901224322_message-images/migration.sql" with { type: "text" }
import botEffort from "@drizzle/20260901225418_bot-effort/migration.sql" with { type: "text" }
import botModel from "@drizzle/20260901225922_bot-model/migration.sql" with { type: "text" }
import botPermission from "@drizzle/20260902153823_bot-permission/migration.sql" with { type: "text" }
import plugins from "@drizzle/20260902190240_plugins/migration.sql" with { type: "text" }
import multiAccountAccess from "@drizzle/20260902235222_multi-account-access/migration.sql" with { type: "text" }
import whatsappMessages from "@drizzle/20260903011817_whatsapp-messages/migration.sql" with { type: "text" }
import whatsappContacts from "@drizzle/20260903021111_whatsapp-contacts/migration.sql" with { type: "text" }
import colleagues from "@drizzle/20260903112334_colleagues/migration.sql" with { type: "text" }
import botAvatarSeed from "@drizzle/20260903142103_burly_maestro/migration.sql" with { type: "text" }
import messageError from "@drizzle/20260903145043_thin_greymalkin/migration.sql" with { type: "text" }
import consolidatedRoutines from "@drizzle/20260903162419_consolidated-routines/migration.sql" with { type: "text" }
import messageQuestions from "@drizzle/20260903210921_bouncy_bedlam/migration.sql" with { type: "text" }
import triggers from "@drizzle/20260904155709_icy_sauron/migration.sql" with { type: "text" }
import botContinuity from "@drizzle/20260905015106_bot-continuity/migration.sql" with { type: "text" }
import optionalProjectFolder from "@drizzle/20260905031351_optional-project-folder/migration.sql" with { type: "text" }
import dropTaskOutcome from "@drizzle/20260906111558_drop-task-outcome/migration.sql" with { type: "text" }
import questionMultiple from "@drizzle/20260906111826_question-multiple/migration.sql" with { type: "text" }
import botPinned from "@drizzle/20260908115928_ancient_old_lace/migration.sql" with { type: "text" }

import memberPermissions from "@drizzle/20260908135220_member-permissions/migration.sql" with { type: "text" }
import memoryCurationVersion from "@drizzle/20260909142116_overjoyed_stellaris/migration.sql" with { type: "text" }
import messageMemory from "@drizzle/20260909155316_message-memory/migration.sql" with { type: "text" }
import visibleSession from "@drizzle/20260923125458_purple_captain_marvel/migration.sql" with { type: "text" }

export const migrations = [
  { name: "20260901132949_initial-schema", timestamp: 1788269389000, sql: initialSchema },
  { name: "20260901184631_routines", timestamp: 1788288391000, sql: routines },
  { name: "20260901200730_memory", timestamp: 1788293250000, sql: memory },
  { name: "20260901224322_message-images", timestamp: 1788302602000, sql: messageImages },
  { name: "20260901225418_bot-effort", timestamp: 1788303258000, sql: botEffort },
  { name: "20260901225922_bot-model", timestamp: 1788303562000, sql: botModel },
  { name: "20260902153823_bot-permission", timestamp: 1788374303000, sql: botPermission },
  { name: "20260902190240_plugins", timestamp: 1788375760000, sql: plugins },
  { name: "20260902235222_multi-account-access", timestamp: 1788393142000, sql: multiAccountAccess },
  { name: "20260903011817_whatsapp-messages", timestamp: 1788398297000, sql: whatsappMessages },
  { name: "20260903021111_whatsapp-contacts", timestamp: 1788401471000, sql: whatsappContacts },
  { name: "20260903112334_colleagues", timestamp: 1788434614000, sql: colleagues },
  { name: "20260903142103_burly_maestro", timestamp: 1788445263000, sql: botAvatarSeed },
  { name: "20260903145043_thin_greymalkin", timestamp: 1788447043000, sql: messageError },
  { name: "20260903162419_consolidated-routines", timestamp: 1788459859000, sql: consolidatedRoutines },
  { name: "20260903210921_bouncy_bedlam", timestamp: 1788473361000, sql: messageQuestions },
  { name: "20260904155709_icy_sauron", timestamp: 1788537429000, sql: triggers },
  { name: "20260905015106_bot-continuity", timestamp: 1788573066000, sql: botContinuity },
  { name: "20260905031351_optional-project-folder", timestamp: 1788578031000, sql: optionalProjectFolder },
  { name: "20260906111558_drop-task-outcome", timestamp: 1788693358000, sql: dropTaskOutcome },
  { name: "20260906111826_question-multiple", timestamp: 1788704306000, sql: questionMultiple },
  { name: "20260908115928_ancient_old_lace", timestamp: 1788879568000, sql: botPinned },
  { name: "20260908135220_member-permissions", timestamp: 1788875540000, sql: memberPermissions },
  { name: "20260909142116_overjoyed_stellaris", timestamp: 1788974476000, sql: memoryCurationVersion },
  { name: "20260909155316_message-memory", timestamp: 1788978796000, sql: messageMemory },
  { name: "20260923125458_purple_captain_marvel", timestamp: 1790168098000, sql: visibleSession },
] satisfies MigrationsJournal
