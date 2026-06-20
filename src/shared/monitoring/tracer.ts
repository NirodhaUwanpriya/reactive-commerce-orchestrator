import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Look up where Jaeger is running on the internal Docker network switch
const jaegerHost = process.env.JAEGER_HOST || 'localhost';

const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'unknown-microservice',
    traceExporter: new OTLPTraceExporter({
        url: `http://${jaegerHost}:4318/v1/traces`, // Push telemetry trace spans to Jaeger's HTTP collector port
    }),
    instrumentations: [
        getNodeAutoInstrumentations({
            // Auto-wrap outbound communication channels, native databases, and framework engines
            '@opentelemetry/instrumentation-express': { enabled: true },
            '@opentelemetry/instrumentation-pg': { enabled: true },
            '@opentelemetry/instrumentation-redis': { enabled: true },
        }),
    ],
});

// Start the SDK telemetry recording loop immediately on process boot
sdk.start();

console.log(`📡 OpenTelemetry Tracer registered for service: [${process.env.OTEL_SERVICE_NAME}]`);

// Handle clean shutdown sequences when Docker stops containers
process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log('Tracing terminated cleanly.'))
        .catch((err) => console.error('Error terminating tracing:', err))
        .finally(() => process.exit(0));
});