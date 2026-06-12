# Generic Skills Library

**Reusable, project-agnostic skills for AI agents**  
**Location**: `generic/skills/`  
**Purpose**: Provide standardized, customizable skills that can be used across any project

---

## 🎯 Overview

This skills library contains **generic, project-agnostic skills** that can be used by AI agents in any software development project. Unlike the original sitephoto-specific skills, these are designed to be:

- ✅ **Universal** - Work for any project type (web, mobile, API, infrastructure, etc.)
- ✅ **Customizable** - Can be adapted for specific project needs
- ✅ **Modular** - Use only the skills you need
- ✅ **Well-documented** - Clear instructions and examples
- ✅ **Production-tested** - Based on proven patterns from real projects

---

## 📚 Skill Library Contents

| # | Skill | Description | Best For | Size |
|---|-------|-------------|----------|------|
| 1 | [Blocker Tracking](1-blocker-tracking.skill.md) | Systematically track and escalate blockers | Planners, Product Owners, Project Managers | 10KB |
| 2 | [Definition of Done](2-definition-of-done.skill.md) | Verify work meets quality standards | Developers, QA, DevOps, Tech Leads | 15KB |
| 3 | [Git Safety](3-git-safety.skill.md) | Prevent git workflow mistakes | All developers, DevOps | 18KB |
| 4 | [Acceptance Criteria Scorer](4-acceptance-criteria-scorer.skill.md) | Evaluate acceptance criteria quality | Product Owners, QA Agents | 20KB |

**Total**: 4 skills, ~63KB

---

## 🚀 Quick Start

### For New Users

1. **Browse the skills** - Read through the skill files to understand what's available
2. **Select relevant skills** - Choose skills that match your project needs
3. **Customize if needed** - Modify skills for your specific context
4. **Reference in agent prompts** - Include skill references in your agent definitions
5. **Train your team** - Ensure everyone understands how to use the skills

### For Existing Users (Migrating from Sitephoto)

1. **Compare with originals** - Review differences from SKILL-LIBRARY/ versions
2. **Update agent references** - Point to generic/skills/ instead of SKILL-LIBRARY/
3. **Customize for your project** - Add project-specific details as needed
4. **Test thoroughly** - Verify agents behave as expected with new skills

---

## 📖 How to Use These Skills

### Method 1: Direct Reference (Recommended)

Reference skills directly in your agent prompts:

```markdown
## Skills This Agent Uses

This agent uses these skills from the Generic Skills Library:

1. **Definition of Done** (generic/skills/2-definition-of-done.skill.md)
   - Verify work meets quality standards
   - Use appropriate DoD section for work type

2. **Git Safety** (generic/skills/3-git-safety.skill.md)
   - Prevent git workflow mistakes
   - Use feature branches, never commit to main

For detailed implementation, see the skill files.
```

### Method 2: Copy and Customize

For project-specific needs, copy skills to your project and customize:

```bash
# Copy a skill to your project
cp generic/skills/2-definition-of-done.skill.md my-project/skills/2-definition-of-done.skill.md

# Customize for your project
nano my-project/skills/2-definition-of-done.skill.md
```

Then reference the customized version in your agents.

### Method 3: Extend with Project-Specific Skills

Create project-specific skills that build on generic ones:

```bash
# Create project-specific skills directory
mkdir -p my-project/skills/

# Create a project-specific skill that extends generic ones
cat > my-project/skills/5-project-specific.skill.md << 'EOF'
# Skill: Project-Specific Requirements

**Extends**: generic/skills/2-definition-of-done.skill.md
**Purpose**: Add project-specific DoD items

## Project-Specific DoD

In addition to the Generic Definition of Done, this project requires:

- [ ] All code must follow our design system
- [ ] All API endpoints must be documented in Swagger
- [ ] All changes must be deployed to staging before production
EOF
```

---

## 🎯 Skill Selection Guide

### By Project Type

| Project Type | Recommended Skills | Notes |
|--------------|-------------------|-------|
| **Web Application** | All 4 skills | Full coverage recommended |
| **Mobile App** | All 4 skills | Focus on mobile-specific edge cases |
| **API/Service** | Definition of Done, Git Safety, Acceptance Criteria Scorer | Focus on API-specific DoD |
| **Infrastructure** | Definition of Done, Git Safety | Add DevOps-specific DoD |
| **Data Pipeline** | Definition of Done, Git Safety | Focus on data quality DoD |
| **Library/Package** | Definition of Done, Git Safety | Focus on code quality |

### By Team Size

| Team Size | Recommended Skills | Notes |
|-----------|-------------------|-------|
| **1-3 people** | Definition of Done, Git Safety | Start with essentials |
| **4-10 people** | All 4 skills | Add Blocker Tracking and Acceptance Criteria Scorer |
| **11-25 people** | All 4 skills | Consider role-specific customizations |
| **26+ people** | All 4 skills + custom | Add domain-specific skills |

### By Methodology

| Methodology | Recommended Skills | Notes |
|-------------|-------------------|-------|
| **Agile/Scrum** | All 4 skills | Full coverage for sprint-based work |
| **Kanban** | Definition of Done, Git Safety, Acceptance Criteria Scorer | Focus on flow |
| **Waterfall** | Definition of Done, Acceptance Criteria Scorer | Phase-based focus |
| **DevOps** | Definition of Done, Git Safety | CI/CD integration |

---

## 🔧 Customization Guide

### Customizing for Your Project

Each skill can be customized in several ways:

#### 1. Add Project-Specific Examples

Add examples that are relevant to your project:

```markdown
## Project-Specific Examples

### For Our E-commerce Project

**Good Criteria:**
- "User can add items to cart and see updated cart total"
- "Checkout process validates payment information before processing"

**Bad Criteria:**
- "Make checkout better" (too vague)
```

#### 2. Adjust Thresholds and Standards

Modify standards to match your project requirements:

```markdown
### Our Code Quality Standards

- Code coverage: >= 90% (instead of 80%)
- Response time: < 200ms (instead of < 500ms)
- Browser support: Last 3 versions of Chrome, Firefox, Safari
```

#### 3. Add Domain-Specific Requirements

Add sections for your industry or domain:

```markdown
### Healthcare-Specific Requirements

- [ ] HIPAA compliance verified
- [ ] Patient data encryption at rest and in transit
- [ ] Audit logging for all data access
- [ ] Access controls follow principle of least privilege
```

#### 4. Remove Irrelevant Items

If a skill section doesn't apply to your project, remove or mark as N/A:

```markdown
### Mobile Development DoD

**Note**: Not applicable for this backend-only project

- [ ] N/A - Mobile-specific items not required
```

---

## 📊 Skill Comparison

| Skill | Complexity | Learning Curve | Impact | Customization Needed |
|-------|------------|----------------|--------|---------------------|
| Blocker Tracking | Low | 1-2 hours | High | Low |
| Definition of Done | Medium | 2-4 hours | Very High | Medium |
| Git Safety | Low | 1-2 hours | High | Low |
| Acceptance Criteria Scorer | Medium | 2-4 hours | High | Medium |

### Which Skill to Start With?

1. **Git Safety** - Quickest win, prevents costly mistakes
2. **Definition of Done** - Most impactful, improves quality consistently
3. **Acceptance Criteria Scorer** - Great for Product/QA collaboration
4. **Blocker Tracking** - Essential for larger teams

---

## 🎓 Learning Resources

### For Each Skill

Each skill file contains:
- **Overview** - What the skill does and why it matters
- **Detailed Instructions** - How to use the skill
- **Examples** - Real-world examples
- **Templates** - Ready-to-use templates
- **Best Practices** - Tips for success
- **Troubleshooting** - Common issues and solutions
- **Customization Guide** - How to adapt for your project

### Recommended Learning Path

1. **Start with Git Safety** (1-2 hours)
   - Read the skill file
   - Set up hooks for your team
   - Train team on workflow

2. **Add Definition of Done** (2-4 hours)
   - Review DoD sections
   - Customize for your project
   - Create team agreement

3. **Add Acceptance Criteria Scorer** (2-4 hours)
   - Learn scoring rubric
   - Practice scoring real criteria
   - Iterate on existing stories

4. **Add Blocker Tracking** (1-2 hours)
   - Set up blocker dashboard
   - Train team on blocker format
   - Integrate with standups

---

## 🤝 Integration with Agent Templates

These skills are designed to work with the generic agent templates in `generic/agents/generic-templates/`.

See [AGENT-SKILL-MAPPING.md](AGENT-SKILL-MAPPING.md) for detailed agent-skill configurations.

---

## 📈 Success Metrics

Track these metrics to measure skill adoption and effectiveness:

### Per Skill

| Metric | Blocker Tracking | Definition of Done | Git Safety | Acceptance Criteria Scorer |
|--------|------------------|-------------------|------------|----------------------------|
| **Adoption Rate** | % of blockers tracked properly | % of work meeting DoD | % of PRs with proper git workflow | % of stories with score >= 7 |
| **Impact** | Reduced blocked time | Reduced rework | Fewer git mistakes | Fewer ambiguous stories |
| **Quality** | Average blocker resolution time | DoD compliance rate | Git workflow compliance | Average criteria score |

### Overall

- **Team Satisfaction**: Survey team on skill usefulness
- **Time Saved**: Estimate time saved by preventing issues
- **Quality Improvement**: Measure improvement in deliverable quality
- **Collaboration**: Measure improvement in team communication

---

## 🔄 Maintenance and Updates

### Versioning

Each skill file includes version information:

```markdown
**Last Updated**: 2026-06-04  
**Version**: 1.0  
**Applies to**: All projects
```

### Update Process

1. **Identify needed changes** - Based on feedback or new requirements
2. **Test changes** - Verify with sample scenarios
3. **Document changes** - Update version and date
4. **Communicate changes** - Notify all users
5. **Train team** - Hold workshop if significant changes

### Changelog

Each skill maintains its own version history. For major changes, create a centralized changelog:

```markdown
# Skills Changelog

## 2026-06-04 - Version 1.0
- Initial release of all 4 generic skills
- Created AGENT-SKILL-MAPPING.md
- Added comprehensive documentation

## Future Updates
- Add new skills based on community feedback
- Improve existing skills based on usage data
- Add more examples and templates
```

---

## 🙏 Contributing

We welcome contributions to improve these skills! Here's how you can help:

### 1. Report Issues
- Found a bug or unclear instruction? Open an issue
- Suggest improvements to skill definitions
- Report real-world usage problems

### 2. Suggest New Skills
- Have a skill idea that would help your team? Share it!
- Submit a skill proposal with:
  - Skill name and purpose
  - Target audience
  - Key features
  - Examples

### 3. Improve Existing Skills
- Better examples
- More templates
- Clearer instructions
- Additional use cases

### 4. Share Your Customizations
- Share how you customized skills for your project
- Contribute project-specific extensions
- Share success stories and metrics

---

## 📞 Support

### FAQ

**Q: Can I use these skills for non-software projects?**  
A: Yes! While designed for software, many skills (especially Definition of Done and Blocker Tracking) can be adapted for any project type.

**Q: Do I need to use all the skills?**  
A: No! Start with the skills that are most relevant to your project and team. You can add more later.

**Q: Can I modify the skills?**  
A: Absolutely! These are meant to be customized for your specific needs. We recommend forking the skills you use.

**Q: How do I know which skills to use?**  
A: See the Skill Selection Guide above, or check AGENT-SKILL-MAPPING.md for role-based recommendations.

**Q: What if a skill doesn't fit my project?**  
A: Customize it! Remove irrelevant sections, add project-specific requirements, or create a new skill based on it.

**Q: How often are skills updated?**  
A: Skills are updated based on feedback and changing best practices. Major updates will be announced.

---

## 🎉 Getting Started Checklist

- [ ] Read this README
- [ ] Browsed all available skills
- [ ] Selected skills for my project
- [ ] Customized skills if needed
- [ ] Set up agent references to skills
- [ ] Trained my team on skill usage
- [ ] Integrated skills into our workflow
- [ ] Started tracking metrics

---

## 📚 Additional Resources

- [Agent-Skill Mapping](AGENT-SKILL-MAPPING.md) - Detailed agent configurations
- [Generic Agent Templates](../agents/generic-templates/) - Agent templates that use these skills
- [Configuration Guide](../config/) - Project-specific configuration examples

---

**Maintained by**: [Your Team]  
**License**: [MIT/Apache/Other]  
**Contact**: [your-email@example.com]  
**Last Updated**: 2026-06-04  
**Version**: 1.0
