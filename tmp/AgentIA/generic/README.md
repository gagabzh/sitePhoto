# Generic Agent & Skill System

**Reusable, project-agnostic AI agents and skills for any software development team**  
**Location**: `generic/`  
**Version**: 1.0

---

## 🌟 Overview

Welcome to the **Generic Agent & Skill System**! This system provides **production-ready, customizable AI agents and skills** that can be used for **any software development project**. Whether you're building a web application, mobile app, API, or infrastructure, these generic components give you a solid foundation to start from.

### What This System Provides

1. **🤖 Generic Agent Templates** - Role-specific agent definitions for common team roles (Product Owner, Developer, Tech Lead, QA, Planner)

2. **📚 Generic Skills Library** - Reusable skills that agents can use (Blocker Tracking, Definition of Done, Git Safety, Acceptance Criteria Scorer)

3. **⚙️ Configuration System** - Framework for customizing agents and skills for your specific projects

4. **📖 Comprehensive Documentation** - Clear instructions for using and customizing the system

### Key Benefits

- ✅ **Project-agnostic** - Works for any software project (web, mobile, API, infrastructure, data, etc.)
- ✅ **Role-based** - Templates for all common development team roles
- ✅ **Customizable** - Easy to adapt for your specific needs
- ✅ **Proven patterns** - Based on real-world, successful implementations
- ✅ **Modular** - Use only what you need, add as you grow
- ✅ **Well-documented** - Clear instructions and examples
- ✅ **Integrated** - Agents and skills work together seamlessly

---

## 🚀 Quick Start Guide

### Step 1: Understand the Structure

```
generic/
├── README.md                    # This file - system overview
│
├── skills/                      # Generic Skills Library
│   ├── README.md                # Skills documentation
│   ├── 1-blocker-tracking.skill.md
│   ├── 2-definition-of-done.skill.md
│   ├── 3-git-safety.skill.md
│   ├── 4-acceptance-criteria-scorer.skill.md
│   └── AGENT-SKILL-MAPPING.md  # Agent-skill relationships
│
├── agents/                     # Generic Agent Templates
│   └── generic-templates/       # Role-based templates
│       ├── README.md            # Agent templates documentation
│       ├── TEMPLATE-agent-generic.md      # Master template
│       ├── product-owner-generic.md
│       ├── planner-generic.md
│       ├── tech-lead-generic.md
│       ├── developer-generic.md
│       └── qa-agent-generic.md
│
└── config/                     # Configuration System
    └── README.md                # Configuration documentation
```

### Step 2: Choose Your Starting Point

**Based on your needs:**

| If you need... | Start here |
|---------------|------------|
| **A complete agent system for my team** | Use all templates + skills |
| **Agents for a specific project** | Copy and customize agent templates |
| **Skills for your existing agents** | Use the Generic Skills Library |
| **A foundation to build on** | Start with the master template |
| **Configuration examples** | Check the config directory |

### Step 3: Set Up Your Project

```bash
# Create your project directory
mkdir -p my-project/agents my-project/skills my-project/config

# Copy the generic templates you need
cp -r generic/agents/generic-templates/*.md my-project/agents/
cp generic/skills/*.skill.md my-project/skills/
cp generic/config/*.md my-project/config/

# Or use specific files as needed
cp generic/agents/generic-templates/qa-agent-generic.md my-project/agents/qa-agent.md
```

### Step 4: Customize for Your Project

1. **Update agent templates** with your project context
2. **Customize skills** with your project requirements
3. **Create configuration** for your team
4. **Test and iterate**

### Step 5: Deploy and Use

1. **Set up your AI agent platform** (Claude, custom, etc.)
2. **Load your agent definitions**
3. **Train your team** on using the agents
4. **Monitor and improve** over time

---

## 📦 System Components

### 1. Generic Agent Templates

**Location**: `generic/agents/generic-templates/`

Pre-built agent definitions for common roles:

| Template | Role | Complexity | Best For |
|----------|------|------------|----------|
| [product-owner-generic.md](agents/generic-templates/product-owner-generic.md) | Product Owner | ⭐⭐⭐⭐ | Feature definition, prioritization |
| [planner-generic.md](agents/generic-templates/planner-generic.md) | Planner/Scrum Master | ⭐⭐⭐⭐ | Sprint planning, coordination |
| [tech-lead-generic.md](agents/generic-templates/tech-lead-generic.md) | Tech Lead | ⭐⭐⭐⭐⭐ | Code review, architecture |
| [developer-generic.md](agents/generic-templates/developer-generic.md) | Developer | ⭐⭐⭐ | Implementation, testing |
| [qa-agent-generic.md](agents/generic-templates/qa-agent-generic.md) | QA Agent | ⭐⭐⭐⭐ | Testing, quality assurance |
| [TEMPLATE-agent-generic.md](agents/generic-templates/TEMPLATE-agent-generic.md) | Master Template | ⭐⭐ | Creating custom agents |

**Features:**
- Complete role definitions with responsibilities
- Integrated with Generic Skills Library
- Customizable workflows and processes
- Clear decision authority and escalation paths
- Project context placeholders
- Customization instructions

**Learn more**: [Agent Templates Documentation](agents/generic-templates/README.md)

---

### 2. Generic Skills Library

**Location**: `generic/skills/`

Reusable skills for AI agents:

| Skill | Purpose | Best For | Size |
|-------|---------|----------|------|
| [1-blocker-tracking.skill.md](skills/1-blocker-tracking.skill.md) | Track and escalate blockers systematically | Planners, Product Owners | 10KB |
| [2-definition-of-done.skill.md](skills/2-definition-of-done.skill.md) | Verify work meets quality standards | All developers | 15KB |
| [3-git-safety.skill.md](skills/3-git-safety.skill.md) | Prevent git workflow mistakes | All developers | 18KB |
| [4-acceptance-criteria-scorer.skill.md](skills/4-acceptance-criteria-scorer.skill.md) | Evaluate acceptance criteria quality | Product Owners, QA | 20KB |

**Features:**
- Universal applicability (any project type)
- Detailed instructions and examples
- Customizable for project needs
- Templates and checklists included
- Troubleshooting guides

**Learn more**: [Skills Library Documentation](skills/README.md)

---

### 3. Configuration System

**Location**: `generic/config/`

Framework for customizing the system for your projects:

- **YAML/JSON/Markdown** configuration files
- **Project metadata** and standards
- **Agent-specific configurations**
- **Skill customizations**
- **Domain-specific rules** (healthcare, finance, etc.)
- **Integration configurations**

**Features:**
- Flexible configuration formats
- Environment-specific overrides
- Validation tools
- Industry-specific templates
- Versioning support

**Learn more**: [Configuration Documentation](config/README.md)

---

## 🎯 Use Cases

### Use Case 1: Starting a New Project

**Scenario**: You're starting a new web application project with a team of 8.

**Solution**:
1. Copy all agent templates to your project
2. Customize each agent with your project details
3. Configure the skills for your tech stack
4. Set up project-specific standards
5. Start using the agents immediately

**Time to value**: 1-2 days

---

### Use Case 2: Improving an Existing Project

**Scenario**: Your existing project has process issues and inconsistent quality.

**Solution**:
1. Introduce the Definition of Done skill
2. Add the Git Safety skill for all developers
3. Create QA and Tech Lead agents
4. Gradually adopt other skills as needed
5. Measure improvements over time

**Time to value**: 1-2 weeks

---

### Use Case 3: Creating Specialized Agents

**Scenario**: Your team has unique roles not covered by standard templates.

**Solution**:
1. Start with the master template
2. Define your custom role's responsibilities
3. Select appropriate skills from the library
4. Add role-specific workflows and processes
5. Customize for your unique needs

**Time to value**: 2-3 days

---

### Use Case 4: Enterprise-Wide Standardization

**Scenario**: You want to standardize processes across multiple teams.

**Solution**:
1. Create base configurations for different project types
2. Define common standards and thresholds
3. Create agent templates for each role
4. Roll out gradually with training
5. Monitor adoption and effectiveness

**Time to value**: 2-4 weeks

---

## 📊 Comparison: Generic vs. Original Sitephoto

| Aspect | Generic System | Original Sitephoto |
|--------|---------------|-------------------|
| **Scope** | Any project | Sitephoto-specific |
| **Flexibility** | Highly customizable | Fixed for sitephoto |
| **Skills** | 4 universal skills | 4 sitephoto-specific skills |
| **Agents** | 5+ role templates | 8 sitephoto-specific agents |
| **Configuration** | Full system | None (hardcoded) |
| **Documentation** | Comprehensive | Sitephoto-focused |
| **Customization** | Designed for it | Difficult to adapt |
| **Maintenance** | Community-driven | Project-specific |

### Migration Path from Sitephoto

If you're currently using the sitephoto-specific agents and skills:

1. **Compare**: Review the differences between original and generic versions
2. **Update references**: Change paths from `SKILL-LIBRARY/` to `generic/skills/`
3. **Customize**: Add your project-specific details to generic templates
4. **Test**: Verify agents behave as expected
5. **Iterate**: Gradually adopt more generic components

**Benefits of migrating:**
- More maintainable (generic = reusable)
- Easier to update (one place to change)
- Better for multiple projects
- More customizable
- Future-proof

---

## 🎓 Learning Path

### For Beginners

1. **Start with the overview** (this README)
2. **Read about agent templates** (agents/generic-templates/README.md)
3. **Choose a template** based on your role
4. **Customize it** for your project
5. **Add skills** as needed

**Time**: 1-2 hours

### For Intermediate Users

1. **Understand the skill system** (skills/README.md)
2. **Learn skill selection** (skills/AGENT-SKILL-MAPPING.md)
3. **Create a custom agent** from the master template
4. **Customize skills** for your project
5. **Set up configuration**

**Time**: 2-4 hours

### For Advanced Users

1. **Create new skills** for your domain
2. **Extend existing skills** with project-specific requirements
3. **Develop custom workflows**
4. **Integrate with tools** (Jira, GitHub, etc.)
5. **Automate skill checks** (CI/CD integration)

**Time**: 1-2 days

---

## 🤝 Team Roles & Responsibilities

### For Each Role

| Role | Primary Focus | Recommended Agents | Key Skills |
|------|---------------|-------------------|------------|
| **Product Owner** | Feature definition, prioritization | product-owner-generic.md | Acceptance Criteria Scorer, Blocker Tracking |
| **Product Manager** | Product strategy, roadmap | product-owner-generic.md (simplified) | Acceptance Criteria Scorer |
| **Project Manager** | Project planning, coordination | planner-generic.md | Blocker Tracking, Definition of Done |
| **Scrum Master** | Team facilitation, process | planner-generic.md | Blocker Tracking, Definition of Done |
| **Tech Lead** | Code quality, architecture | tech-lead-generic.md | Definition of Done, Git Safety |
| **Engineering Manager** | Team leadership, technical oversight | tech-lead-generic.md + planner-generic.md | All skills |
| **Developer** | Implementation, testing | developer-generic.md | Definition of Done, Git Safety |
| **Frontend Developer** | UI implementation | developer-generic.md (frontend focus) | Definition of Done, Git Safety |
| **Backend Developer** | API, business logic | developer-generic.md (backend focus) | Definition of Done, Git Safety |
| **QA Engineer** | Testing, quality | qa-agent-generic.md | Definition of Done, Git Safety, Acceptance Criteria Scorer |
| **DevOps Engineer** | Infrastructure, deployment | Custom (from TEMPLATE) | Definition of Done, Git Safety |
| **Security Engineer** | Security, compliance | Custom (from TEMPLATE) | Definition of Done, Git Safety |

---

## 🛠️ Customization Guide

### Level 1: Basic Customization (Quick Start)

**What to customize:**
- Project name and description
- Team structure
- Technology stack
- Workflow details

**How to do it:**
1. Open the agent template
2. Find all `[placeholders]` in square brackets
3. Replace with your project-specific values
4. Save and test

**Time**: 15-30 minutes per agent

---

### Level 2: Intermediate Customization

**What to customize:**
- Responsibilities (add/remove based on your process)
- Decision authority (clarify for your organization)
- Tools and access levels
- Workflows (adjust to match your process)

**How to do it:**
1. Review the agent's responsibilities
2. Add or remove items based on your needs
3. Update decision authority to match your organization
4. Customize workflows to reflect your actual process
5. Test with real scenarios

**Time**: 1-2 hours per agent

---

### Level 3: Advanced Customization

**What to customize:**
- Skill configurations
- Domain-specific requirements
- Integration with external tools
- Automated checks and validations

**How to do it:**
1. Create project configuration file
2. Define custom skill configurations
3. Add domain-specific rules
4. Set up integrations with your tools
5. Create automation scripts

**Time**: 2-4 hours

---

### Level 4: Expert Customization

**What to customize:**
- New skills for your domain
- New agent templates
- Custom workflows
- Advanced integrations

**How to do it:**
1. Identify gaps in existing skills/agents
2. Create new skills using the skill template
3. Create new agent templates
4. Integrate with your custom tools
5. Contribute back to the generic system

**Time**: 1-2 days

---

## 📈 Success Metrics

Track these metrics to measure the effectiveness of your agent system:

### Agent-Specific Metrics

| Metric | How to Measure | Target |
|--------|----------------|--------|
| Agent adoption rate | % of team using agents | 100% |
| Agent satisfaction | Survey team members | > 4/5 |
| Time saved | Estimate time saved per task | Positive |
| Quality improvement | Reduction in bugs/rewrites | > 20% |
| Review time | Average time to complete reviews | < 1 hour |
| First-time approval rate | % of PRs approved without changes | > 50% |

### Skill-Specific Metrics

| Skill | Metric | Target |
|-------|--------|--------|
| Blocker Tracking | Average blocker resolution time | < 24 hours |
| Definition of Done | DoD compliance rate | > 90% |
| Git Safety | Git workflow compliance | 100% |
| Acceptance Criteria Scorer | Average criteria score | >= 7 |

### Team Metrics

| Metric | How to Measure | Target |
|--------|----------------|--------|
| Sprint velocity | Stories completed per sprint | Stable/increasing |
| Cycle time | Time from start to finish | Decreasing |
| Escape rate | Bugs found in production | < 5% |
| Team satisfaction | Survey | > 4/5 |
| Process adherence | % following defined processes | > 80% |

---

## 🔄 Continuous Improvement

### For Individuals

- **Per task**: Review what went well and what could be improved
- **Per PR**: Learn from code review feedback
- **Weekly**: Identify patterns in your work
- **Monthly**: Update your development environment

### For Teams

- **Per sprint**: Conduct retrospectives, identify improvements
- **Monthly**: Review metrics, adjust processes
- **Quarterly**: Review and update agent configurations
- **Annually**: Major process improvements

### For the System

- **Per project**: Document customizations and lessons learned
- **Quarterly**: Review system effectiveness
- **Annually**: Major system updates
- **Ongoing**: Community contributions and improvements

---

## 🙏 Contributing

We welcome contributions to improve this system! Here's how you can help:

### 1. Report Issues
- Found a bug in a skill or template?
- Unclear instructions?
- Missing functionality?
- Open an issue with details

### 2. Suggest Improvements
- Better examples
- Clearer instructions
- Additional use cases
- Improved organization

### 3. Share Your Customizations
- Project-specific configurations
- Custom skills you've created
- Agent templates you've developed
- Lessons learned from usage

### 4. Create New Content
- New agent templates for different roles
- New skills for different domains
- Configuration examples
- Training materials

### 5. Help Others
- Answer questions
- Review pull requests
- Share your experiences
- Mentor new users

---

## 📞 Support & FAQ

### FAQ

**Q: Can I use this system for non-software projects?**  
A: Yes! While designed for software, many components (especially Definition of Done and Blocker Tracking) can be adapted for any project type by removing technical sections.

**Q: Do I need to use all the agents and skills?**  
A: No! Start with the agents and skills that are most relevant to your project. You can add more later as your needs grow.

**Q: Can I mix generic and project-specific agents?**  
A: Absolutely! You can use generic agents for some roles and create custom agents for specialized roles.

**Q: How do I know which skills to use for my project?**  
A: See the [Agent-Skill Mapping](skills/AGENT-SKILL-MAPPING.md) for recommendations, or check the skill selection guide in the [Skills README](skills/README.md).

**Q: Can I modify the generic agents and skills?**  
A: Yes! These are designed to be customized. We recommend:
1. Copy the generic version to your project
2. Customize it for your needs
3. Keep the original as a reference
4. Contribute improvements back if they're broadly useful

**Q: What if my team doesn't use Agile?**  
A: The system is methodology-agnostic. You can adapt the workflows for Waterfall, Kanban, or any other methodology.

**Q: Can I use different templates for different projects?**  
A: Yes! Each project can have its own set of customized agents and skills based on its specific needs.

**Q: How often should I update my agents and skills?**  
A: Review your agents and skills:
- **Per project**: When starting a new project
- **Quarterly**: For existing projects
- **As needed**: When processes change significantly

**Q: What's the relationship between agents and skills?**  
A: Agents **use** skills. Skills are **reusable components** that provide specific capabilities. An agent can use multiple skills, and multiple agents can use the same skill. This creates a modular, maintainable system.

---

## 🎯 Roadmap

### Version 1.0 (Current)
- ✅ Generic Skills Library (4 skills)
- ✅ Generic Agent Templates (5 role-specific + 1 master)
- ✅ Configuration System
- ✅ Comprehensive Documentation
- ✅ Customization Guides

### Version 1.1 (Planned)
- [ ] Additional skills (e.g., Code Review, Retrospective Facilitation)
- [ ] Additional agent templates (e.g., DevOps, Security, Designer)
- [ ] Industry-specific templates (healthcare, finance, etc.)
- [ ] Automation scripts for common tasks
- [ ] Integration guides for popular tools

### Version 2.0 (Future)
- [ ] Web-based configuration tool
- [ ] Agent/skill registry
- [ ] Community marketplace for sharing
- [ ] Analytics and reporting
- [ ] AI-powered recommendations

---

## 📚 Additional Resources

### Documentation
- [Generic Skills Library](skills/README.md) - Detailed skill documentation
- [Generic Agent Templates](agents/generic-templates/README.md) - Agent customization guides
- [Configuration System](config/README.md) - Project configuration framework
- [Agent-Skill Mapping](skills/AGENT-SKILL-MAPPING.md) - How agents and skills relate

### Examples
- [Product Owner Agent](agents/generic-templates/product-owner-generic.md) - Feature definition role
- [Tech Lead Agent](agents/generic-templates/tech-lead-generic.md) - Code review role
- [QA Agent](agents/generic-templates/qa-agent-generic.md) - Testing role
- [Developer Agent](agents/generic-templates/developer-generic.md) - Implementation role
- [Planner Agent](agents/generic-templates/planner-generic.md) - Coordination role

### Templates
- [Master Agent Template](agents/generic-templates/TEMPLATE-agent-generic.md) - Create custom agents
- [Web App Configuration](config/README.md#example-2-web-application-project) - Example configuration
- [Enterprise Configuration](config/README.md#example-3-enterprise-project-with-compliance) - Advanced example

---

## 🎉 Getting Started Checklist

- [ ] Read this README
- [ ] Understood the system components
- [ ] Chosen your starting point
- [ ] Set up your project directory
- [ ] Copied relevant templates
- [ ] Customized agents for your project
- [ ] Configured skills for your needs
- [ ] Set up project configuration
- [ ] Tested agents with sample scenarios
- [ ] Trained team on using agents
- [ ] Started tracking metrics

---

## 📝 License & Attribution

**License**: [MIT/Apache 2.0/Other - specify for your use]  
**Attribution**: Based on the sitephoto project's agent and skill system, made generic by [Your Team]  
**Original Source**: [Link to original sitephoto project if applicable]  

---

**Maintained by**: [Your Team]  
**Contact**: [your-email@example.com]  
**Repository**: [your-repository-url]  
**Last Updated**: 2026-06-04  
**Version**: 1.0

---

## 🌟 Final Thoughts

This Generic Agent & Skill System is designed to **save you time, improve quality, and scale your processes** across projects. By starting with these proven templates and customizing them for your needs, you can:

- **Launch new projects faster** with pre-built agent definitions
- **Improve consistency** across your teams and projects
- **Reduce onboarding time** for new team members
- **Scale your processes** as your team grows
- **Focus on delivery** instead of reinventing processes

**We're excited to see what you build with this system!** 

Happy coding! 🚀
