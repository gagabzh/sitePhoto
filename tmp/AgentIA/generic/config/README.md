# Generic Configuration System

**Project-specific configuration for the generic agent/skill system**  
**Location**: `generic/config/`  
**Purpose**: Provide a framework for customizing the generic agents and skills for specific projects

---

## 🎯 Overview

This directory contains **configuration examples and templates** for customizing the Generic Agent/Skill System for your specific projects. The configuration system allows you to:

- ✅ **Adapt generic agents** for your project's specific needs
- ✅ **Customize skills** with project-specific requirements
- ✅ **Define team structures** and role mappings
- ✅ **Set project-specific thresholds** and standards
- ✅ **Integrate with your existing tools** and workflows

---

## 📚 Configuration Options

The system supports multiple configuration formats:

| Format | File Extension | Best For | Example |
|--------|---------------|----------|---------|
| **YAML** | `.yaml` or `.yml` | Machine-readable, structured | `my-project.yaml` |
| **JSON** | `.json` | Machine-readable, API-friendly | `my-project.json` |
| **Markdown** | `.md` | Human-readable, documented | `my-project-config.md` |
| **Environment Variables** | `.env` | Runtime configuration | `.env` |

---

## 🚀 Quick Start

### Option 1: Simple YAML Configuration (Recommended)

Create a `my-project.yaml` file:

```yaml
# generic/config/my-project.yaml

# Project metadata
project:
  name: "My Awesome Project"
  description: "A web application for managing user data"
  version: "1.0.0"
  methodology: "Scrum"
  team_size: 8

# Team roles and their agent configurations
agents:
  - name: "Product Owner"
    role: "product-owner"
    description: "Defines features and prioritizes work"
    color: "purple"
    skills:
      - "1-blocker-tracking"
      - "3-git-safety"
      - "4-acceptance-criteria-scorer"
    config:
      acceptance_criteria_threshold: 7
      default_priority: "High"
    
  - name: "Tech Lead"
    role: "tech-lead"
    description: "Reviews code quality and architecture"
    color: "gold"
    skills:
      - "2-definition-of-done"
      - "3-git-safety"
    config:
      code_coverage_target: 90
      pr_size_limit: 500
    
  - name: "QA Agent"
    role: "qa-agent"
    description: "Validates functionality and quality"
    color: "green"
    skills:
      - "2-definition-of-done"
      - "3-git-safety"
      - "4-acceptance-criteria-scorer"
    config:
      test_coverage_threshold: 80
      regression_testing_required: true
    
  - name: "Developer"
    role: "developer"
    description: "Implements features and bug fixes"
    color: "blue"
    skills:
      - "2-definition-of-done"
      - "3-git-safety"
    config:
      test_coverage_target: 80
      max_pr_size: 500

# Skill customizations
skills:
  required:
    - "2-definition-of-done"
    - "3-git-safety"
  optional:
    - "1-blocker-tracking"
    - "4-acceptance-criteria-scorer"
  customizations:
    "2-definition-of-done":
      backend:
        code_coverage: 90
        test_types: ["unit", "integration", "e2e"]
      frontend:
        code_coverage: 80
        test_types: ["unit", "component", "e2e"]

# Project-specific standards
standards:
  git:
    protected_branches: ["main", "develop", "production"]
    branch_naming: "feature/CODE-description"
    commit_message_format: "type(scope): subject"
  testing:
    coverage_threshold: 80
    required_test_types: ["unit", "integration"]
  quality:
    max_complexity: 10
    max_file_length: 300
    require_code_review: true

# External integrations
integrations:
  issue_tracker: "Jira"
  ci_cd: "GitHub Actions"
  monitoring: "Datadog"
  deployment: "AWS ECS"

# Custom domain rules (if applicable)
rules:
  healthcare:
    hipaa_compliance: true
    audit_logging: true
    encryption_required: true
  finance:
    pci_dss_compliance: false
    gdpr_compliance: true
```

---

## 📖 Configuration Reference

### Project Metadata

| Field | Type | Description | Required | Default |
|-------|------|-------------|----------|---------|
| `name` | string | Project name | ✅ | - |
| `description` | string | Project description | ❌ | "" |
| `version` | string | Project version | ❌ | "1.0.0" |
| `methodology` | string | Development methodology (Scrum, Kanban, Waterfall, etc.) | ❌ | "Agile" |
| `team_size` | integer | Number of team members | ❌ | 1 |

---

### Agent Configuration

Each agent has the following configuration options:

| Field | Type | Description | Required | Default |
|-------|------|-------------|----------|---------|
| `name` | string | Agent display name | ✅ | - |
| `role` | string | Agent role identifier | ✅ | - |
| `description` | string | Agent description | ❌ | "" |
| `color` | string | Display color (blue, green, purple, gold, red, etc.) | ❌ | "blue" |
| `skills` | array | List of skill IDs from Generic Skills Library | ✅ | [] |
| `config` | object | Agent-specific configuration | ❌ | {} |

---

### Skill Configuration

| Field | Type | Description | Required | Default |
|-------|------|-------------|----------|---------|
| `required` | array | Skills required for all agents | ❌ | [] |
| `optional` | array | Skills available but not required | ❌ | [] |
| `customizations` | object | Project-specific skill modifications | ❌ | {} |

---

### Standards Configuration

#### Git Standards

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `protected_branches` | array | Branches that cannot be committed to directly | ["main"] |
| `branch_naming` | string | Pattern for feature branch names | "feature/CODE-description" |
| `commit_message_format` | string | Commit message format (e.g., "type(scope): subject") | "type: subject" |
| `require_pr_approval` | boolean | Whether PRs require approval | true |
| `min_approvals` | integer | Minimum number of approvals required | 1 |

#### Testing Standards

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `coverage_threshold` | integer | Minimum test coverage percentage | 80 |
| `required_test_types` | array | Types of tests required | ["unit"] |
| `max_test_time` | integer | Maximum test execution time in seconds | 60 |
| `require_e2e_tests` | boolean | Whether end-to-end tests are required | false |

#### Quality Standards

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `max_complexity` | integer | Maximum cyclomatic complexity | 10 |
| `max_file_length` | integer | Maximum lines per file | 300 |
| `require_code_review` | boolean | Whether code review is required | true |
| `require_docs` | boolean | Whether documentation is required | true |

---

## 🎯 Configuration Examples

### Example 1: Minimal Configuration (Small Team)

```yaml
# generic/config/small-team.yaml

project:
  name: "Small Project"
  team_size: 3

agents:
  - name: "Developer"
    role: "developer"
    skills: ["2-definition-of-done", "3-git-safety"]
    
  - name: "Product Owner"
    role: "product-owner"
    skills: ["3-git-safety", "4-acceptance-criteria-scorer"]

standards:
  testing:
    coverage_threshold: 70
  git:
    protected_branches: ["main"]
```

---

### Example 2: Web Application Project

```yaml
# generic/config/web-app.yaml

project:
  name: "Web Application"
  description: "A modern web application"
  methodology: "Scrum"
  team_size: 10

agents:
  - name: "Product Owner"
    role: "product-owner"
    color: "purple"
    skills: ["1-blocker-tracking", "3-git-safety", "4-acceptance-criteria-scorer"]
    config:
      acceptance_criteria_threshold: 8
      
  - name: "Tech Lead"
    role: "tech-lead"
    color: "gold"
    skills: ["2-definition-of-done", "3-git-safety"]
    config:
      code_coverage_target: 85
      pr_size_limit: 400
      
  - name: "Planner"
    role: "planner"
    color: "blue"
    skills: ["1-blocker-tracking", "2-definition-of-done", "3-git-safety"]
    
  - name: "Frontend Developer"
    role: "developer"
    color: "light-blue"
    skills: ["2-definition-of-done", "3-git-safety"]
    config:
      test_coverage_target: 80
      
  - name: "Backend Developer"
    role: "developer"
    color: "dark-blue"
    skills: ["2-definition-of-done", "3-git-safety"]
    config:
      test_coverage_target: 90
      
  - name: "QA Engineer"
    role: "qa-agent"
    color: "green"
    skills: ["2-definition-of-done", "3-git-safety", "4-acceptance-criteria-scorer"]

skills:
  customizations:
    "2-definition-of-done":
      frontend:
        accessibility_required: true
        responsive_testing_required: true
      backend:
        api_documentation_required: true
        security_review_required: true

standards:
  git:
    protected_branches: ["main", "develop"]
    branch_naming: "feature/US-N-description"
    require_pr_approval: true
    min_approvals: 2
    
  testing:
    coverage_threshold: 80
    required_test_types: ["unit", "integration"]
    
  quality:
    max_complexity: 10
    max_file_length: 250
```

---

### Example 3: Enterprise Project with Compliance

```yaml
# generic/config/enterprise.yaml

project:
  name: "Enterprise Healthcare System"
  description: "HIPAA-compliant healthcare management system"
  methodology: "SAFe"
  team_size: 50

agents:
  - name: "Product Owner"
    role: "product-owner"
    skills: ["1-blocker-tracking", "3-git-safety", "4-acceptance-criteria-scorer"]
    config:
      acceptance_criteria_threshold: 9
      compliance_review_required: true
      
  - name: "Tech Lead"
    role: "tech-lead"
    skills: ["2-definition-of-done", "3-git-safety"]
    config:
      code_coverage_target: 95
      security_review_required: true
      
  - name: "Security Lead"
    role: "tech-lead"
    description: "Security-focused tech lead"
    color: "red"
    skills: ["2-definition-of-done", "3-git-safety"]
    config:
      security_review_required: true
      penetration_testing_required: true
      
  - name: "Planner"
    role: "planner"
    skills: ["1-blocker-tracking", "2-definition-of-done", "3-git-safety"]
    config:
      release_cadence: "quarterly"
      
  - name: "QA Lead"
    role: "qa-agent"
    color: "dark-green"
    skills: ["1-blocker-tracking", "2-definition-of-done", "3-git-safety", "4-acceptance-criteria-scorer"]
    config:
      test_coverage_threshold: 90
      
  - name: "QA Engineer"
    role: "qa-agent"
    skills: ["2-definition-of-done", "3-git-safety", "4-acceptance-criteria-scorer"]

skills:
  customizations:
    "2-definition-of-done":
      all:
        security_review_required: true
        performance_testing_required: true
        documentation_required: true
      backend:
        code_coverage: 95
        sql_injection_protection_required: true

standards:
  git:
    protected_branches: ["main", "develop", "staging", "production"]
    require_signed_commits: true
    require_pr_approval: true
    min_approvals: 2
    
  testing:
    coverage_threshold: 90
    required_test_types: ["unit", "integration", "e2e", "security"]
    max_test_time: 120
    
  quality:
    max_complexity: 5
    max_file_length: 200
    require_code_review: true
    require_peer_approval: true

rules:
  healthcare:
    hipaa_compliance: true
    audit_logging: true
    encryption_required: true
    phi_protection: true
    access_controls: "RBAC"
    retention_policy: "7 years"
    
  security:
    vulnerability_scanning: true
    penetration_testing: "quarterly"
    security_training: "annual"

integrations:
  issue_tracker: "Jira"
  ci_cd: "Jenkins"
  monitoring: "Splunk"
  deployment: "Kubernetes"
  security_scanning: "Checkmarx"
```

---

### Example 4: API-First Project

```yaml
# generic/config/api-project.yaml

project:
  name: "API Service"
  description: "RESTful API for data management"
  methodology: "Kanban"
  team_size: 5

agents:
  - name: "API Product Owner"
    role: "product-owner"
    description: "Focuses on API design and endpoint specifications"
    skills: ["3-git-safety", "4-acceptance-criteria-scorer"]
    config:
      api_specification_format: "OpenAPI 3.0"
      
  - name: "API Tech Lead"
    role: "tech-lead"
    description: "Reviews API design and implementation"
    skills: ["2-definition-of-done", "3-git-safety"]
    config:
      api_coverage_target: 100
      
  - name: "API Developer"
    role: "developer"
    skills: ["2-definition-of-done", "3-git-safety"]
    config:
      test_coverage_target: 90
      api_documentation_required: true
      
  - name: "API QA"
    role: "qa-agent"
    description: "Specializes in API testing"
    skills: ["2-definition-of-done", "3-git-safety", "4-acceptance-criteria-scorer"]
    config:
      test_types: ["unit", "integration", "contract", "performance"]

skills:
  customizations:
    "2-definition-of-done":
      backend:
        api_documentation_required: true
        api_versioning_required: true
        rate_limiting_required: true
        authentication_required: true
        error_handling_required: true
        
    "4-acceptance-criteria-scorer":
      api_specific:
        status_codes_required: true
        response_format_required: true
        error_handling_required: true

standards:
  git:
    protected_branches: ["main"]
    branch_naming: "feature/api-ENDPOINT"
    
  testing:
    coverage_threshold: 90
    required_test_types: ["unit", "integration", "contract"]
    performance_testing_required: true
    
  quality:
    api_documentation_standard: "OpenAPI 3.0"
    require_api_versioning: true
    require_deprecation_notice: true

integrations:
  api_documentation: "Swagger UI"
  api_testing: "Postman/Newman"
  ci_cd: "GitHub Actions"
  monitoring: "Prometheus + Grafana"
```

---

## 🛠️ Configuration Tools

### Command Line Tools

#### Validate YAML Configuration

```bash
# Install yamllint
pip install yamllint

# Validate configuration
yamllint generic/config/my-project.yaml
```

#### Validate JSON Configuration

```bash
# Install jq for JSON processing
# Ubuntu/Debian: sudo apt-get install jq
# macOS: brew install jq

# Validate JSON
jq empty generic/config/my-project.json
```

---

### Editor Support

#### VS Code

Install these extensions for YAML/JSON editing:
- **Red Hat YAML** (for YAML validation and autocompletion)
- **JSON Tools** (for JSON validation and formatting)
- **YAML** (by Red Hat)

#### JetBrains IDEs

Built-in support for YAML and JSON with:
- Syntax highlighting
- Autocompletion
- Validation
- Schema support

---

## 🔧 Customization Guide

### Step 1: Create Your Configuration File

```bash
# Create directory if it doesn't exist
mkdir -p generic/config/

# Create your configuration file
touch generic/config/my-project.yaml
```

### Step 2: Copy and Modify a Template

```bash
# Copy a template
cp generic/config/examples/web-app.yaml generic/config/my-project.yaml

# Or create from scratch using the reference above
```

### Step 3: Customize for Your Project

1. **Update project metadata** (name, description, etc.)
2. **Define your agents** (roles, skills, configurations)
3. **Set project standards** (git, testing, quality)
4. **Add domain-specific rules** (if applicable)
5. **Configure integrations** (issue tracker, CI/CD, etc.)

### Step 4: Validate Your Configuration

```bash
# For YAML
yamllint generic/config/my-project.yaml

# For JSON
jq empty generic/config/my-project.json
```

### Step 5: Reference Configuration in Your Agents

In your agent files, reference the configuration:

```markdown
## 🌍 Project Context

This agent is configured using `generic/config/my-project.yaml`.

Key configuration:
- Test coverage target: 90%
- PR size limit: 400 lines
- Required test types: unit, integration, e2e

See the configuration file for complete details.
```

---

## 🎯 Configuration Best Practices

### 1. Start Simple
- Begin with minimal configuration
- Add complexity as needed
- Don't over-configure

### 2. Keep Configuration Versioned
- Store configuration in version control
- Track changes with meaningful commit messages
- Document why changes were made

### 3. Document Your Configuration
- Add comments explaining non-obvious settings
- Document team-specific conventions
- Keep a changelog of configuration changes

### 4. Validate Regularly
- Validate configuration files in CI
- Check for deprecated or unused settings
- Verify configuration matches actual practices

### 5. Review Configuration in Retrospectives
- Discuss if configuration is working for the team
- Identify settings that cause friction
- Adjust based on team feedback

---

## 📊 Configuration Examples by Industry

### Healthcare (HIPAA Compliant)

```yaml
rules:
  healthcare:
    hipaa_compliance: true
    phi_protection: true
    audit_logging: true
    encryption_required:
      at_rest: true
      in_transit: true
    access_controls: "RBAC"
    retention_policy: "7 years"
    breach_notification: "72 hours"
```

### Finance (PCI DSS Compliant)

```yaml
rules:
  finance:
    pci_dss_compliance: true
    card_data_protection: true
    fraud_detection: true
    encryption_required: true
    access_logging: true
    vulnerability_scanning: "monthly"
```

### E-commerce

```yaml
rules:
  ecommerce:
    payment_processing: true
    pci_compliance: true
    inventory_management: true
    order_tracking: true
    fraud_prevention: true
    refund_processing: true
```

### Government (FedRAMP)

```yaml
rules:
  government:
    fedramp_compliance: true
    accessibility: "WCAG 2.1 AA"
    security controls: "NIST 800-53"
    audit_requirements: "continuous monitoring"
    data_sovereignty: "US-only"
```

---

## 🔄 Configuration Management

### Versioning Configuration

Keep a changelog in your configuration file or a separate file:

```yaml
# generic/config/CHANGELOG.yaml

versions:
  - version: "1.0.0"
    date: "2026-06-04"
    changes:
      - "Initial configuration"
      - "Added basic agent definitions"
      - "Set default standards"
    
  - version: "1.1.0"
    date: "2026-06-11"
    changes:
      - "Increased test coverage target to 90%"
      - "Added healthcare compliance rules"
      - "Updated agent skills"
```

### Environment-Specific Configuration

Use different configuration files for different environments:

```
generic/config/
├── base.yaml          # Base configuration (shared)
├── development.yaml   # Development-specific overrides
├── staging.yaml       # Staging-specific overrides
└── production.yaml    # Production-specific overrides
```

Then merge them at runtime (base + environment-specific).

### Configuration Inheritance

Create a hierarchy of configuration files:

```
generic/config/
├── defaults.yaml      # Default values
├── team.yaml          # Team-specific overrides
└── project.yaml       # Project-specific overrides
```

---

## 🙏 Contributing

We welcome contributions to the configuration system! Here's how you can help:

### 1. Share Your Configuration
- Contribute example configurations for different project types
- Share what worked (and didn't work) for your team
- Provide real-world configuration examples

### 2. Improve Documentation
- Add more examples
- Clarify configuration options
- Improve the reference documentation

### 3. Create Configuration Tools
- Scripts to validate configuration
- Tools to generate configuration from templates
- Integration with other tools

### 4. Report Issues
- Unclear configuration options
- Missing configuration features
- Errors or inconsistencies

---

## 📞 Support & FAQ

### FAQ

**Q: Do I need to use YAML for configuration?**  
A: No! You can use YAML, JSON, or even Markdown. YAML is recommended for its readability, but use what works best for your team.

**Q: Can I have multiple configuration files?**  
A: Yes! You can have a base configuration and environment-specific overrides, or different configurations for different projects.

**Q: How do I know if my configuration is valid?**  
A: Use the validation tools mentioned above (yamllint for YAML, jq for JSON), or create custom validation scripts.

**Q: What if my project doesn't fit any of the examples?**  
A: Start with the closest example and customize it for your needs. The configuration system is designed to be flexible.

**Q: Can I extend the configuration schema?**  
A: Yes! The schema is not fixed. Add any fields that are useful for your project. Just document what you add.

**Q: How often should I update my configuration?**  
A: Update your configuration whenever your project requirements or team processes change. Review it at least quarterly.

**Q: Can I use environment variables in my configuration?**  
A: Yes! You can reference environment variables in your configuration files (especially useful for sensitive data).

---

## 🎉 Checklist: Setting Up Configuration

- [ ] Chosen configuration format (YAML, JSON, or Markdown)
- [ ] Created configuration file in `generic/config/`
- [ ] Added project metadata
- [ ] Defined agent configurations
- [ ] Set project standards
- [ ] Added domain-specific rules (if applicable)
- [ ] Configured integrations
- [ ] Validated configuration file
- [ ] Referenced configuration in agent files
- [ ] Tested agents with configuration
- [ ] Documented configuration for team

---

## 📚 Additional Resources

- [Generic Skills Library](../skills/README.md) - The skills these agents use
- [Generic Agent Templates](../agents/generic-templates/README.md) - Agent templates to customize
- [Agent-Skill Mapping](../skills/AGENT-SKILL-MAPPING.md) - How agents and skills relate

---

**Maintained by**: [Your Team]  
**License**: [MIT/Apache/Other]  
**Contact**: [your-email@example.com]  
**Last Updated**: 2026-06-04  
**Version**: 1.0
