# Generic Agent Templates

**Reusable, project-agnostic agent templates for any software development team**  
**Location**: `generic/agents/generic-templates/`  
**Purpose**: Provide standardized, customizable agent definitions that can be adapted for any project

---

## 🎯 Overview

This directory contains **generic agent templates** that serve as starting points for creating project-specific AI agents. Each template is:

- ✅ **Role-focused** - Designed for a specific role (QA, Developer, Tech Lead, etc.)
- ✅ **Project-agnostic** - Works for any project type or technology stack
- ✅ **Customizable** - Easy to adapt for your specific project needs
- ✅ **Well-documented** - Clear instructions for customization
- ✅ **Proven** - Based on real-world agent patterns from successful projects
- ✅ **Integrated** - References the Generic Skills Library for consistent behavior

---

## 📚 Available Templates

| Template | Role | Description | Best For | Complexity |
|----------|------|-------------|----------|------------|
| [TEMPLATE-agent-generic.md](TEMPLATE-agent-generic.md) | Master Template | Foundation for creating any agent | Creating custom agents | ⭐⭐ |
| [product-owner-generic.md](product-owner-generic.md) | Product Owner | Defines features, writes stories, prioritizes work | Product management | ⭐⭐⭐⭐ |
| [planner-generic.md](planner-generic.md) | Planner/Scrum Master | Plans sprints, manages blockers, coordinates work | Team coordination | ⭐⭐⭐⭐ |
| [tech-lead-generic.md](tech-lead-generic.md) | Tech Lead | Code review, architecture, quality assurance | Technical leadership | ⭐⭐⭐⭐⭐ |
| [developer-generic.md](developer-generic.md) | Developer | Implements features, writes tests, follows standards | Development | ⭐⭐⭐ |
| [qa-agent-generic.md](qa-agent-generic.md) | QA Agent | Tests functionality, validates acceptance criteria | Quality assurance | ⭐⭐⭐⭐ |

**Total**: 6 templates (1 master + 5 role-specific)

---

## 🚀 Quick Start Guide

### For New Users (Creating Your First Agent)

1. **Choose a template** based on the role you need:
   - Start with a role-specific template (recommended)
   - Or use the master template for custom roles

2. **Copy the template** to your agents directory:
   ```bash
   # For a QA Agent
   cp generic/agents/generic-templates/qa-agent-generic.md my-project/agents/qa-agent.md
   
   # For a custom role
   cp generic/agents/generic-templates/TEMPLATE-agent-generic.md my-project/agents/my-agent.md
   ```

3. **Customize the template** (see customization instructions below)

4. **Reference the Generic Skills Library** in your agent:
   ```markdown
   ## Skills This Agent Uses
   
   This agent uses these skills from the Generic Skills Library:
   
   1. **Definition of Done** (generic/skills/2-definition-of-done.skill.md)
   2. **Git Safety** (generic/skills/3-git-safety.skill.md)
   ```

5. **Test your agent** with sample scenarios

6. **Iterate based on feedback**

---

## 📖 Template Structure

All agent templates follow a consistent structure:

```
---
name: [agent-role]
description: [Brief description of agent's purpose]
color: [color-name]
---

# [Agent Role Name]

## 🎯 Role Overview
- Mission statement
- Key principle

## 📋 Core Responsibilities
- Primary responsibilities (5-8 items)
- What this agent DOES NOT do

## 🌍 Project Context
- Team structure
- Technology stack
- Codebase information
- Workflow details

## 🔧 Skills This Agent Uses
- References to Generic Skills Library
- When to use each skill

## 📊 Workflows
- 2-4 key workflows this agent participates in
- Visual flow diagrams
- Agent's role in each workflow

## 🎯 Decision Authority
- What this agent CAN do
- What this agent CANNOT do
- Escalation paths

## 📌 Key Principles
- 3-5 guiding principles

## 🔧 Tools & Access
- Access levels (repository, issues, PRs, etc.)
- Tools used by this agent

## 📈 Success Metrics
- How to measure this agent's effectiveness

## 🔄 Continuous Improvement
- How this agent learns and improves over time

## 🙏 Customization Instructions
- Step-by-step guide to adapt for your project

## 📚 Quick Reference
- Cheat sheets, templates, examples
```

---

## 🎯 Agent Selection Guide

### By Team Role

| Your Role | Recommended Template | Skills Needed |
|-----------|---------------------|---------------|
| **Product Owner / Product Manager** | product-owner-generic.md | Blocker Tracking, Git Safety, Acceptance Criteria Scorer |
| **Project Manager / Program Manager** | planner-generic.md | Blocker Tracking, Definition of Done, Git Safety |
| **Scrum Master / Agile Coach** | planner-generic.md | Blocker Tracking, Definition of Done, Git Safety |
| **Tech Lead / Architect** | tech-lead-generic.md | Definition of Done, Git Safety |
| **Engineering Manager** | tech-lead-generic.md + planner-generic.md | All 4 skills |
| **Developer / Engineer** | developer-generic.md | Definition of Done, Git Safety |
| **Frontend Developer** | developer-generic.md | Definition of Done, Git Safety |
| **Backend Developer** | developer-generic.md | Definition of Done, Git Safety |
| **Full-Stack Developer** | developer-generic.md | Definition of Done, Git Safety |
| **Mobile Developer** | developer-generic.md | Definition of Done, Git Safety |
| **QA Engineer / Tester** | qa-agent-generic.md | Definition of Done, Git Safety, Acceptance Criteria Scorer |
| **QA Lead / Test Manager** | qa-agent-generic.md | All 4 skills |
| **DevOps Engineer** | Custom (from TEMPLATE) | Definition of Done, Git Safety |
| **Security Engineer** | Custom (from TEMPLATE) | Definition of Done, Git Safety |
| **Business Analyst** | product-owner-generic.md (simplified) | Acceptance Criteria Scorer, Git Safety |
| **Designer / UX Specialist** | Custom (from TEMPLATE) | Definition of Done, Git Safety |
| **Data Scientist / Analyst** | Custom (from TEMPLATE) | Definition of Done, Git Safety |

### By Project Type

| Project Type | Recommended Agents |
|--------------|---------------------|
| **Web Application** | Product Owner, Planner, Tech Lead, Developers, QA |
| **Mobile App** | Product Owner, Planner, Tech Lead, Mobile Devs, QA |
| **API/Service** | Product Owner, Planner, Tech Lead, Backend Devs, QA |
| **Infrastructure** | Product Owner (for requirements), Tech Lead, DevOps, QA |
| **Data Pipeline** | Product Owner, Planner, Data Engineer, QA |
| **Library/Package** | Tech Lead, Developers, QA |

### By Team Size

| Team Size | Recommended Agents |
|-----------|---------------------|
| **1-3 people** | Combined roles (e.g., Product Owner + Planner, Developer + QA) |
| **4-10 people** | Product Owner, Planner, Tech Lead, 2-3 Developers, 1 QA |
| **11-25 people** | All role-specific agents, possibly multiple per role |
| **26+ people** | All role-specific agents, specialized variants |

---

## 🔧 Customization Guide

### Step 1: Copy the Template

```bash
# Navigate to your project's agents directory
cd my-project/agents/

# Copy the template you need
cp ../../generic/agents/generic-templates/[template-name].md ./

# Rename it for your project
mv [template-name].md [your-agent-name].md
```

### Step 2: Update Metadata

Edit the frontmatter (the `---` section at the top):

```yaml
---
name: my-qa-agent          # Change to your agent's name
description: QA Agent for MyProject — validates features, creates test plans, ensures quality  # Customize description
color: green                # Choose a color (blue, green, purple, gold, red, etc.)
---
```

### Step 3: Customize Project Context

Fill in the `## 🌍 Project Context` section with your specific details:

```markdown
### Team Structure (Customize for Your Project)
- **Product Owner**: [Name or role description]
- **Tech Lead**: [Name or role description]
- **Developers**: [Number and type]
- **QA Agent**: [Name or role description]
- **DevOps**: [Name or role description]

### Technology Stack
- **Frontend**: [React/Vue/Angular/Other]
- **Backend**: [Node.js/Python/Java/Other]
- **Database**: [PostgreSQL/MySQL/MongoDB/Other]
- **Testing**: [Jest/Mocha/Cypress/Other]

### Workflow
- **Methodology**: [Agile/Scrum/Kanban]
- **Sprint Length**: [1/2/4 weeks]
- **Definition of Ready**: [Your criteria]
- **Definition of Done**: [Your criteria]
```

### Step 4: Adjust Responsibilities

Review the `## 📋 Core Responsibilities` section:

- **Add** responsibilities specific to your project
- **Remove** responsibilities that don't apply
- **Modify** responsibilities to match your workflow

Example:
```markdown
### Code Implementation
- [ ] Implement features according to acceptance criteria
- [ ] Follow project-specific coding standards
- [ ] Write tests for all new code (target: >= 90% coverage)  # Changed from 80%
- [ ] Document all API endpoints in Swagger  # Added for API project
```

### Step 5: Update Skills

Reference the skills your agent needs from the Generic Skills Library:

```markdown
## 🔧 Skills This Agent Uses

This agent uses these skills from the Generic Skills Library:

1. **Definition of Done** (generic/skills/2-definition-of-done.skill.md)
   - Custom implementation note for your project

2. **Git Safety** (generic/skills/3-git-safety.skill.md)
   - Custom implementation note for your project
```

### Step 6: Customize Workflows

Update the `## 📊 Workflows` section to match your team's actual process:

- Change workflow names to match your project
- Update steps to reflect your actual process
- Add or remove workflows as needed
- Include project-specific tools or systems

### Step 7: Set Decision Authority

Clarify what your agent can and cannot do in your organization:

```markdown
### You CAN:
- ✓ Approve PRs for merge
- ✓ Request changes to code
- ✓ Block PRs with critical issues

### You CANNOT:
- ✗ Deploy to production (DevOps does that)
- ✗ Define requirements (Product Owner does that)
```

### Step 8: Update Tools & Access

Specify the actual tools and access levels for your project:

```markdown
### Access Level
- **Repository**: Read + Write (for this role)
- **Issue tracking**: Read + Write + Admin
- **PR reviews**: Can approve and merge

### Tools You Use
- **Project Management**: Jira
- **Communication**: Slack
- **CI/CD**: GitHub Actions
- **Testing**: Jest, Cypress
```

### Step 9: Add Domain-Specific Content

Include any project or domain-specific information:

- **Industry regulations** (for healthcare, finance, etc.)
- **Company policies**
- **Project conventions**
- **Special considerations**

Example for healthcare project:
```markdown
### Healthcare-Specific Requirements

All features must comply with:
- [ ] HIPAA regulations for patient data
- [ ] Audit logging for all data access
- [ ] Encryption at rest and in transit
- [ ] Principle of least privilege for access control
```

### Step 10: Test and Iterate

1. **Test the agent** with sample scenarios
2. **Gather feedback** from team members
3. **Iterate** based on real-world usage
4. **Refine** over time as your process evolves

---

## 🤝 Integration with Generic Skills Library

All templates reference skills from the **Generic Skills Library** (`generic/skills/`):

| Skill | Used By | Purpose |
|-------|---------|---------|
| [1-blocker-tracking.skill.md](../../skills/1-blocker-tracking.skill.md) | Planners, Product Owners | Track and escalate blockers |
| [2-definition-of-done.skill.md](../../skills/2-definition-of-done.skill.md) | All roles | Verify work meets quality standards |
| [3-git-safety.skill.md](../../skills/3-git-safety.skill.md) | All roles | Prevent git workflow mistakes |
| [4-acceptance-criteria-scorer.skill.md](../../skills/4-acceptance-criteria-scorer.skill.md) | Product Owners, QA | Evaluate acceptance criteria quality |

**Benefits of this integration:**
- ✅ Consistent behavior across agents
- ✅ Shared knowledge and best practices
- ✅ Easy to update (change skill once, all agents benefit)
- ✅ Modular (use only the skills you need)

---

## 🎓 Creating a Custom Agent from Scratch

If none of the existing templates fit your needs, create a custom agent:

1. **Start with the master template:**
   ```bash
   cp TEMPLATE-agent-generic.md my-custom-agent.md
   ```

2. **Fill in the basic structure:**
   - Name and description
   - Role overview and key principle
   - Core responsibilities
   - Project context

3. **Select appropriate skills** from the Generic Skills Library

4. **Define workflows** specific to this agent's role

5. **Set decision authority** and escalation paths

6. **Add key principles** that guide this agent's behavior

7. **Customize tools and access**

8. **Test thoroughly**

---

## 📊 Customization Examples

### Example 1: Creating a DevOps Agent

```bash
# Start with master template
cp TEMPLATE-agent-generic.md devops-generic.md

# Customize for DevOps role
```

Key customizations:
- Responsibilities: Infrastructure, deployment, monitoring
- Skills: Definition of Done (DevOps section), Git Safety
- Workflows: Deployment, infrastructure changes, incident response
- Tools: Terraform, Docker, Kubernetes, monitoring systems
- Access: Infrastructure admin, production deploy access

### Example 2: Creating a Security Agent

```bash
# Start with master template
cp TEMPLATE-agent-generic.md security-agent-generic.md
```

Key customizations:
- Responsibilities: Security review, vulnerability assessment
- Skills: Definition of Done (Security section), Git Safety
- Workflows: Security review, vulnerability scanning, compliance
- Tools: Security scanners, vulnerability databases
- Access: Read-only to all code, security tool admin

### Example 3: Creating a Data Scientist Agent

```bash
# Start with master template
cp TEMPLATE-agent-generic.md data-scientist-generic.md
```

Key customizations:
- Responsibilities: Data analysis, model development, experimentation
- Skills: Definition of Done (Data Science section), Git Safety
- Workflows: Data exploration, model training, deployment
- Tools: Jupyter, MLflow, data visualization tools
- Access: Data repositories, ML infrastructure

---

## 🔄 Maintenance and Updates

### Updating Templates

When you improve a template or create a custom agent:

1. **Document your changes** in the template's customization section
2. **Share improvements** with the team
3. **Consider contributing back** to the generic templates if your changes are broadly useful
4. **Keep templates in sync** with the Generic Skills Library

### Version Control

Each template includes version information:

```markdown
**Template Version**: 1.0  
**Last Updated**: 2026-06-04  
**Based on**: [Original source if applicable]  
**Maintainer**: [Your Team]
```

---

## 🙏 Contributing

We welcome contributions to improve these templates! Here's how you can help:

### 1. Improve Existing Templates
- Add better examples
- Clarify instructions
- Improve structure
- Add missing sections

### 2. Create New Templates
- For roles not currently covered
- For specific methodologies (e.g., Kanban, Waterfall)
- For specific industries (e.g., healthcare, finance)

### 3. Share Your Customizations
- Contribute project-specific templates
- Share what worked (and didn't work) for your team
- Provide real-world examples

### 4. Report Issues
- Unclear instructions
- Missing information
- Errors or inconsistencies

---

## 📞 Support & FAQ

### FAQ

**Q: Can I use these templates for non-software projects?**  
A: Yes! While designed for software, many templates (especially Product Owner and Planner) can be adapted for any project type by removing technical sections.

**Q: Do I need to use all sections in the template?**  
A: No! The templates are comprehensive, but you should remove or simplify sections that don't apply to your project.

**Q: Can I create agents that combine multiple roles?**  
A: Absolutely! For small teams, you might combine roles (e.g., Developer + QA, Product Owner + Planner). Just merge the relevant responsibilities.

**Q: How do I know which skills to assign to my agent?**  
A: See the [Agent-Skill Mapping](../../skills/AGENT-SKILL-MAPPING.md) for recommendations, or check the skill selection guide in the [Generic Skills Library README](../../skills/README.md).

**Q: What if my team doesn't use Agile?**  
A: The templates are methodology-agnostic. You can adapt them for Waterfall, Kanban, or any other methodology by modifying the workflows.

**Q: Can I use different templates for different projects?**  
A: Yes! Each project can have its own set of customized agents based on its specific needs.

**Q: How often should I update my agents?**  
A: Review your agents at least quarterly, or whenever your team process changes significantly.

---

## 🎉 Checklist: Creating a New Agent

- [ ] Chosen appropriate template or started from master
- [ ] Copied template to my project directory
- [ ] Renamed file to match my agent's name
- [ ] Updated frontmatter (name, description, color)
- [ ] Customized project context (team, tech, workflow)
- [ ] Adjusted responsibilities for my project
- [ ] Selected appropriate skills from Generic Skills Library
- [ ] Updated workflows to match my team's process
- [ ] Set decision authority and escalation paths
- [ ] Customized tools and access levels
- [ ] Added any domain-specific requirements
- [ ] Reviewed with team members who will use this agent
- [ ] Tested agent with sample scenarios
- [ ] Iterated based on feedback
- [ ] Documented customizations

---

## 📚 Additional Resources

- [Generic Skills Library](../../skills/README.md) - The skills these agents use
- [Agent-Skill Mapping](../../skills/AGENT-SKILL-MAPPING.md) - How agents and skills relate
- [Configuration Guide](../../config/README.md) - Project-specific configuration examples

---

**Maintained by**: [Your Team]  
**License**: [MIT/Apache/Other]  
**Contact**: [your-email@example.com]  
**Last Updated**: 2026-06-04  
**Version**: 1.0
