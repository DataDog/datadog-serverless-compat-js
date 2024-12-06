# Datadog Serverless Compatibility Layer for Node.js

Datadog library for Node.js to enable tracing and custom metric submission from Azure Functions and Google Cloud Run Functions (1st gen).

## Installation

1. Install the Datadog Serverless Compatibility Layer.
```
npm install @datadog/serverless-compat
```

2. Install the Datadog Tracing Library following the official documentation for [Tracing Node.js Applications](https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/nodejs/).

3. Add the Datadog Serverless Compatibility Layer and the Datadog Tracer in code.

```
require("@datadog/serverless-compat").start();

// This line must come before importing any instrumented module.
const tracer = require('dd-trace').init();
```

## Configuration

1. Set Datadog environment variables
  - `DD_API_KEY` = `<YOUR API KEY>`
  - `DD_SITE` = `datadoghq.com`
  - `DD_ENV` = `<ENVIRONMENT`
  - `DD_SERVICE` = `<SERVICE NAME>`
  - `DD_VERSION` = `<VERSION>`
  - `DD_TRACE_STATS_COMPUTATION_ENABLED` = `true`

The default Datadog site is **datadoghq.com**. To use a different site, set the `DD_SITE` environment variable to the desired destination site. See [Getting Started with Datadog Sites](https://docs.datadoghq.com/getting_started/site/) for the available site values.

The `DD_SERVICE`, `DD_ENV`, and `DD_VERSION` settings are configured from environment variables in Azure and are used to tie telemetry together in Datadog as tags. Read more about [Datadog Unified Service Tagging](https://docs.datadoghq.com/getting_started/tagging/unified_service_tagging).

[Trace Metrics](https://docs.datadoghq.com/tracing/metrics/metrics_namespace/) are enabled by default but can be disabled with the DD_TRACE_STATS_COMPUTATION_ENABLED environment variable.

Enable debug logs for the Datadog Serverless Compatibility Layer with the DD_LOG_LEVEL environment variable:

```
DD_LOG_LEVEL=debug
```

Alternatively disable logs for the Datadog Serverless Compatibility Layer with the DD_LOG_LEVEL environment variable:

```
DD_LOG_LEVEL=off
```

2. For additional tracing configuration options, see the [official documentation for Datadog trace client](https://datadoghq.dev/dd-trace-js/).

3. If installing to Azure Functions, install the [Datadog Azure Integration](https://docs.datadoghq.com/integrations/azure/#setup) and set tags on your Azure Functions to further extend unified service tagging. This allows for Azure Function metrics and other Azure metrics to be correlated with traces.
