# SonarCloud analysis

The project uses SonarCloud automatic analysis. Its repository configuration is
`.sonarcloud.properties`, read from the default branch.

## Versioned migration duplication

Migrations 0018 and 0019 each replace `save_recurring_rule` with the next version
of its definition. The repeated scheduling logic is intentional migration
history. Editing deployed migrations to share code would change how a fresh
database is built without updating databases that already applied them.

The configuration excludes these two exact paths from copy-paste detection:

```properties
sonar.cpd.exclusions=supabase/migrations/0018_phone_notifications.sql,supabase/migrations/0019_payment_methods.sql
```

This does not exclude their security or correctness analysis. App code, test
scripts, and other migrations remain subject to duplication checks.

For the exclusion to apply before this configuration reaches the default branch,
a project administrator can set the same two paths under **Administration →
General Settings → Analysis Scope → Duplication → Duplication Exclusions**.
Then trigger another analysis and check that the two files have no detected
duplication while their other analysis results remain available.

References: [Automatic analysis](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis)
and [duplication exclusions](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/exclude-from-coverage-duplication).
