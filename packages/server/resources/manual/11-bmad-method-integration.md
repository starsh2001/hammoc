## 11. BMAD-METHOD Integration

Hammoc provides first-class support for the [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) (Breakthrough Method for Agile AI-Driven Development).

### 11.1 What is BMAD-METHOD?

BMAD-METHOD is an open-source framework that structures AI-driven software development. It defines:

- **Agents** — Specialized AI roles organized by workflow phase
- **Documents** — PRD, Architecture spec, Frontend spec, Stories, QA plans, and supplementary docs (brainstorming, market research, competitor analysis, project brief)
- **Workflows** — Phase-based processes from research through implementation to completion

### 11.2 Setting Up BMad in a Project

BMad can be set up in two ways:

**During project creation:**
1. In the **New Project** dialog, the **"Setup BMad"** checkbox is enabled by default
2. Select the BMAD-METHOD version from the dropdown (defaults to latest)
3. The `.bmad-core` folder is automatically created when the project is registered

**For existing projects:**
1. Open the project card's **kebab menu** (⋮) on the project list page
2. Click **"Setup BMad"** (only shown for non-BMad projects)
3. Confirm the version to install
4. The `.bmad-core` folder is created with the required files

The `.bmad-core` folder contains agents, tasks, templates, workflows, and configuration files including `core-config.yaml`.

### 11.3 BMad Agents

Click the **Agent Button** (Users icon, in the chat bottom bar right of the model selector) to open the agent dropdown:

**Planning group:**

| Agent | Role |
|-------|------|
| **Analyst** | Brainstorming, market research, competitor analysis, project brief |
| **PM** (Product Manager) | Defines PRD with epics and stories |
| **UX Expert** | Creates frontend specifications |
| **Architect** | Designs system architecture (backend, frontend, full-stack) |

**Implementation group:**

| Agent | Role |
|-------|------|
| **SM** (Scrum Master) | Drafts stories, orchestrates development |
| **PO** (Product Owner) | Validates story drafts against PRD |
| **Dev** (Developer) | Implements features, applies QA fixes |
| **QA** | Reviews and validates implementation quality |

**Agent dropdown features:**
- **Categorized groups** — Planning, Implementation, Other (with section labels)
- **Active agent checkmark** — Blue check icon next to the currently active agent
- **Agent icon & description** — Emoji icon and hover tooltip with role description
- **Keyboard navigation** — Arrow Up/Down to move, Enter to select, Escape to close
- Selecting an agent sends the agent command (e.g., `/BMad:agents:pm`) as the first prompt in the session

### 11.4 Project Overview Dashboard

For BMad projects, the overview page displays additional sections above the standard project overview (see §5.5):

**BMad Summary Card:**
- Overall **completion percentage** with a progress bar
- **Done/total epics** and **done/total stories** counts
- Background refresh indicator

**Next Step Recommender:**
- Detects the current **workflow phase** (Pre-PRD, Pre-Architecture, Implementation, Completed)
- Shows context-aware **action buttons** (primary/secondary) that navigate to the right agent + task command
- Quick links: New Session, Queue Runner, File Explorer
- See §11.5 for phase details

**Document Status Card:**
- Core documents: **PRD** and **Architecture** with exists/missing indicators
- Supplementary documents: Brainstorming, Market Research, Competitor Analysis, Project Brief, Frontend Spec, UI Architecture
- **"작성 필요"** (Required) badge for missing core documents; **"작성 권장"** (Recommended) for optional documents
- **Agent shortcut buttons** (→) to create missing documents with the appropriate agent
- **Sharded document support** — PRD and Architecture can be split into multiple files; expandable file tree view
- **Auxiliary documents** section — Stories and QA files with counts and expandable file trees

**Epic Progress Card:**
- Each epic shows a **color-coded progress bar** that reflects completion level
- **Done/planned** story count per epic
- Click to **expand** and see individual story statuses with color-coded badges
- Story file links to navigate directly to the story file
- Unwritten story count shown when planned > written

**Recent Issues Card** (replaces Quick Start for BMad projects):
- Last 5 issues with severity dot, title, and status badge
- Click to navigate to the project board
- Link to "View Board"

### 11.5 Workflow Phases & Recommendations

The Next Step Recommender analyzes the project state and suggests actions based on four phases:

**Phase 1: Pre-PRD** (PRD does not exist)
- **Primary:** Create PRD → PM agent
- **Secondary:** Brainstorming, Market Research, Competitor Analysis, Project Brief → Analyst agent
- Once a Project Brief already exists, the **Brainstorming** suggestion is hidden — the recommender treats the Brief as the brainstorm output and stops nagging

**Phase 2: Pre-Architecture** (PRD exists, Architecture does not)
- **Primary:** Create Backend / Frontend / Full-stack Architecture → Architect agent
- **Secondary:** Create Frontend Spec → UX Expert agent (if not exists)

**Phase 3: Implementation** (both PRD and Architecture exist)

Recommendations follow reverse workflow order (finish what's closest to done first):

- **Priority 1:** QA Passed/Waived stories → Commit and mark Done, or re-request QA review → Dev agent
- **Priority 2:** QA Fixed stories → Re-review → QA agent
- **Priority 3:** QA Failed/Concerns stories → Apply QA fixes → Dev agent
- **Priority 4:** Ready for Review stories (no QA gate) → Request QA review → QA agent
- **Priority 5:** In Progress stories → Continue development → Dev agent
- **Priority 6:** Approved stories → Start development (Dev), or re-validate with Validate and Fix / Validate Only → PO agent
- **Priority 7:** Draft stories → Validate and Fix / Validate Only → PO agent
- **Priority 8:** Create next story → SM agent (when no actionable stories)

**Phase 4: Completed** (all planned stories are Done)
- Brainstorm new features → Analyst agent
- Add new epic → PM agent
- Add story to existing epic → SM agent

### 11.6 Queue Templates from PRD

Queue templates automate story development in batch. For details, see §9.9 (Queue Templates).

