# SonarCloud analysis

The project uses SonarCloud automatic analysis. Its repository configuration is
`.sonarcloud.properties`, read from the default branch.

## Scripts and test exclusions

Maintenance scripts and tests are excluded from Sonar analysis at the user's
request. This does not disable Jest, Node regression tests or hosted SQL/live
verification. Application code in `app/` and `src/`, Edge Functions, migrations
and the recovery-email template remain scanned.

```properties
sonar.exclusions=scripts/**,__tests__/**,test-utils/**,**/*.test.*,**/*.spec.*,jest.setup.js
sonar.test.exclusions=__tests__/**,test-utils/**,**/*.test.*,**/*.spec.*
```

Automatic analysis reads the configuration from the default branch. These
repository settings take effect once merged into `main`. To apply the same scope
to a PR before merging, set **Source File Exclusions** and **Test File Exclusions**
under **Administration → General Settings → Analysis Scope → Files**, then rerun
analysis. Use the same patterns shown above; do not exclude `supabase/functions`
or application code.

## Versioned migration duplication

Migrations 0018 and 0019 each replace `save_recurring_rule` with the next version
of its definition. The repeated scheduling logic is intentional migration
history. Editing deployed migrations to share code would change how a fresh
database is built without updating databases that already applied them.

The configuration excludes these two exact paths from copy-paste detection:

```properties
sonar.cpd.exclusions=supabase/migrations/0018_phone_notifications.sql,supabase/migrations/0019_payment_methods.sql
```

This does not exclude their security or correctness analysis. App code and other
migrations remain subject to duplication checks; scripts and tests use the
separate analysis exclusions above.

For the exclusion to apply before this configuration reaches the default branch,
a project administrator can set the same two paths under **Administration →
General Settings → Analysis Scope → Duplication → Duplication Exclusions**.
Then trigger another analysis and check that the two files have no detected
duplication while their other analysis results remain available.

References: [Automatic analysis](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis)
and [duplication exclusions](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/exclude-from-coverage-duplication).
