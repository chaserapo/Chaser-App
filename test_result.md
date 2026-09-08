#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Chaser - Beta Launch-Readiness Pass. This iteration must (1) verify end-to-end spray-job workflow
  on a fresh signup — signup → create/select farm → paddock → machinery → planned spray job → start
  → active → complete → verify record; (2) verify no duplicate rows are produced between planned
  and started jobs and that RLS keeps different businesses isolated; (3) confirm the offline
  resilience layer (spray-job shadow + retry queue in /app/frontend/src/lib/offline-queue.ts)
  keeps an active job available when Supabase reads/writes fail; (4) confirm legal pages render
  from /legal/[slug].tsx and are linked from the More tab; (5) confirm form validation blocks
  "Start Job" without required fields.

frontend:
  - task: "Planned Job prefill from Spray hub"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/records/new.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "params.plannedId (same code path as params.draft) hydrates form from the planned SprayJob row. On Start Job we reuse the same id so the planned row is upserted to status='active' — no duplicate. Please verify: (a) opening a planned card from /spray prefills paddock/machinery/products, (b) tapping Start Job promotes the same row and Spray hub shows 1 active + 0 planned for that job."

  - task: "Required-field validation blocks Start Job"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/records/new.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "REQUIRED = farm_id, paddock_id, operator_id, machinery_id, area_ha, water_rate. validate() highlights missing fields and blocks the cloud save. Verify a blank form cannot start a job and the red banner shows the missing count."

  - task: "Offline resilience for active spray job"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/lib/offline-queue.ts, /app/frontend/src/lib/cloud-repo.ts, /app/frontend/app/active-job/[id].tsx, /app/frontend/app/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "cloudRepo.sprayJobs.save now mirrors to AsyncStorage BEFORE the cloud upsert; cloud failures are swallowed but the local shadow stays pending and is retried on app focus, every 60s, or when the user taps Retry on the active-job banner. cloudRepo.sprayJobs.active/get fall back to the shadow when the cloud query fails or returns nothing. Verify: (i) an active job persists across a hard reload of the web preview, (ii) the offline banner appears when Supabase is unreachable and clears when sync succeeds."

  - task: "Legal pages (Privacy / Terms / Support) and More-tab links"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/legal/[slug].tsx, /app/frontend/app/(tabs)/more.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Legal pages render structured sections with a Beta-draft yellow banner flagging [SQUARE BRACKET] placeholders that need the business's real ABN/address and a solicitor review. More → About links to /legal/privacy, /legal/terms, /legal/support."

  - task: "End-to-end signup → farm → paddock → machinery → planned job → start → complete flow"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/**"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Please run the whole happy-path with a fresh signup pattern hqauto<TS>@gmail.com / Test1234!. Verify the completed record shows correct paddock, machine, operator, tank-mix products, and no duplicate spray_jobs rows land in Supabase (planned→active→completed reuses the same id)."

backend:
  - task: "Multi-tenant RLS isolation on core tables (businesses, business_members, farms, paddocks, spray_jobs, spray_job_products, machinery, chemicals)"
    implemented: true
    working: "NA"
    file: "Supabase project (see /app/frontend/src/lib/cloud-repo.ts)"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Please sign up two distinct businesses (A and B), create data in each, and confirm from Supabase logs / the app that neither can see or mutate the other's rows. In particular, confirm spray_jobs and spray_job_products cannot be listed/updated cross-business."

  - task: "Backend /api/invitations email dispatch endpoint remains healthy"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/invitations.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke test the invitation endpoint responds (400 on missing fields, 200 or provider-passthrough on a valid payload). Not blocking beta if send fails at Resend layer."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 18
  run_ui: true

test_plan:
  current_focus:
    - "End-to-end signup → farm → paddock → machinery → planned job → start → complete flow"
    - "Planned Job prefill from Spray hub"
    - "Required-field validation blocks Start Job"
    - "Offline resilience for active spray job"
    - "Legal pages (Privacy / Terms / Support) and More-tab links"
    - "Multi-tenant RLS isolation on core tables (businesses, business_members, farms, paddocks, spray_jobs, spray_job_products, machinery, chemicals)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Beta Launch-Readiness Pass code complete. Please run the full P0 test list above with the
      web preview at http://localhost:3000. Sign up with hqauto<TIMESTAMP>@gmail.com / Test1234!
      Business = "Chaser Beta Test <TS>". Do NOT use @hectarehq.com. Cover: (1) happy-path spray
      workflow with a planned job, (2) validation blocks empty Start Job, (3) RLS isolation with
      two separate businesses, (4) offline resilience (there is a "Saved locally" banner on the
      active-job screen when Supabase is unreachable). Return: test_reports/iteration_18.json.
  - agent: "testing"
    message: |
      iteration_18: Backend 6/6 PASS, Frontend 9/10 PASS. Flagged one MEDIUM (finish-spray-job-btn
      not visibly committing — likely blocked on GPS-permission-await) and one LOW (window.confirm
      blocks headless A/B RLS cross-check). No cross-business leaks observed in per-session data.
  - agent: "main"
    message: |
      Applied fixes: (a) startFinishFlow now sets finishMode synchronously and fetches weather /
      previews in the background so a stalled GPS prompt cannot trap the farmer; (b) fetchWeather
      races GPS lookups against 2.5s/4s timeouts and Open-Meteo fetch against a 6s abort;
      (c) cancelJob now goes through confirm.ts to avoid accidental job deletion.
  - agent: "testing"
    message: |
      iteration_19: All three fixes PASS in headless. Finish form renders in 0.03s, Start Job
      reachable in 0.01s with no GPS, cancelJob goes through confirm.ts. Planned→active→completed
      preserves a single spray_jobs id (verified end-to-end with live Supabase). No product bugs
      found. `retest_needed: false`. Ready for beta launch on this scope.
