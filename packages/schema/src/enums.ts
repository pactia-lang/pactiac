export enum StackLanguage {
  RUST = "RUST",
}

export enum StackFramework {
  AXUM = "AXUM",
}

export enum DatabaseType {
  POSTGRESQL = "POSTGRESQL",
}

export enum CacheType {
  REDIS = "REDIS",
}

export enum EventMeshType {
  KAFKA = "KAFKA",
}

export enum OrchestrationType {
  KUBERNETES = "KUBERNETES",
}

export enum MetricsType {
  PROMETHEUS = "PROMETHEUS",
}

export enum TracingType {
  OPENTELEMETRY = "OPENTELEMETRY",
}

export enum ArchitectureStyle {
  CLEAN_ARCHITECTURE = "CLEAN_ARCHITECTURE",
}

export enum SyncCommunication {
  REST = "REST",
}

export enum AsyncCommunication {
  KAFKA = "KAFKA",
}

export enum AuthType {
  JWT = "JWT",
}

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE",
}

export enum FieldType {
  UUID = "UUID",
  STRING = "STRING",
  INTEGER = "INTEGER",
  DECIMAL = "DECIMAL",
  BOOLEAN = "BOOLEAN",
  DATETIME = "DATETIME",
  JSON = "JSON",
}

export enum IntegrationDirection {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
  BIDIRECTIONAL = "BIDIRECTIONAL",
}

export enum EnvironmentName {
  DEVELOPMENT = "DEVELOPMENT",
  STAGING = "STAGING",
  PRODUCTION = "PRODUCTION",
}

export enum AlertSeverity {
  CRITICAL = "CRITICAL",
  WARNING = "WARNING",
  INFO = "INFO",
}

export enum AlertDestination {
  PAGERDUTY = "PAGERDUTY",
  SLACK = "SLACK",
}

export enum MetricType {
  COUNTER = "COUNTER",
  HISTOGRAM = "HISTOGRAM",
  GAUGE = "GAUGE",
}

export enum ReconciliationSeverity {
  ERROR = "ERROR",
  WARNING = "WARNING",
}

export enum LlmProviderType {
  OPENAI = "OPENAI",
  ANTHROPIC = "ANTHROPIC",
  MOCK = "MOCK",
}

export enum ExpansionSection {
  MODEL = "MODEL",
  API = "API",
  BUSINESS_RULES = "BUSINESS_RULES",
  INTEGRATIONS = "INTEGRATIONS",
  SCENARIOS = "SCENARIOS",
  ROADMAP = "ROADMAP",
}

export enum TenancyModel {
  SINGLE_TENANT = "SINGLE_TENANT",
  MULTI_TENANT = "MULTI_TENANT",
}

export enum ServiceTopology {
  MODULAR_MONOLITH = "MODULAR_MONOLITH",
  MICROSERVICES = "MICROSERVICES",
}

export enum PaginationStyle {
  CURSOR = "CURSOR",
  OFFSET = "OFFSET",
}

export enum SortOrder {
  ASC = "ASC",
  DESC = "DESC",
}

export enum ParameterKind {
  PRIMITIVE = "PRIMITIVE",
  ENUM = "ENUM",
  DTO = "DTO",
  ENTITY = "ENTITY",
}

export enum IdempotencyMode {
  REQUIRED = "REQUIRED",
  OPTIONAL = "OPTIONAL",
  NONE = "NONE",
}

export enum AuthorizationType {
  PUBLIC = "PUBLIC",
  ROLE = "ROLE",
  OWNERSHIP = "OWNERSHIP",
  CUSTOM = "CUSTOM",
}

export enum OwnershipScope {
  OWN_ROWS = "OWN_ROWS",
  TENANT_ROWS = "TENANT_ROWS",
  ADMIN_BYPASS = "ADMIN_BYPASS",
}

export enum LogicStepType {
  QUERY = "QUERY",
  FETCH = "FETCH",
  INSERT = "INSERT",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  EMIT = "EMIT",
  CACHE_GET = "CACHE_GET",
  CACHE_SET = "CACHE_SET",
  CACHE_INVALIDATE = "CACHE_INVALIDATE",
  CALL_SERVICE = "CALL_SERVICE",
  VALIDATE = "VALIDATE",
}

export enum SyncProtocol {
  REST = "REST",
  GRPC = "GRPC",
}

export enum IntegrationAuthType {
  NONE = "NONE",
  API_KEY = "API_KEY",
  HMAC = "HMAC",
  MTLS = "MTLS",
  OAUTH2_CLIENT_CREDENTIALS = "OAUTH2_CLIENT_CREDENTIALS",
}

export enum IrRootFile {
  Manifest = "manifest.yaml",
  Product = "product.yaml",
}

export enum IrModuleRelativePattern {
  Module = "modules/{moduleKebab}/{moduleKebab}.module.yaml",
  Model = "modules/{moduleKebab}/{moduleKebab}.model.yaml",
  Service = "modules/{moduleKebab}/services/{serviceKebab}.service.yaml",
}

export const stackLanguageValues = Object.values(StackLanguage);
export const stackFrameworkValues = Object.values(StackFramework);
export const databaseTypeValues = Object.values(DatabaseType);
export const cacheTypeValues = Object.values(CacheType);
export const eventMeshTypeValues = Object.values(EventMeshType);
export const orchestrationTypeValues = Object.values(OrchestrationType);
export const metricsTypeValues = Object.values(MetricsType);
export const tracingTypeValues = Object.values(TracingType);
export const architectureStyleValues = Object.values(ArchitectureStyle);
export const syncCommunicationValues = Object.values(SyncCommunication);
export const asyncCommunicationValues = Object.values(AsyncCommunication);
export const authTypeValues = Object.values(AuthType);
export const httpMethodValues = Object.values(HttpMethod);
export const fieldTypeValues = Object.values(FieldType);
export const integrationDirectionValues = Object.values(IntegrationDirection);
export const environmentNameValues = Object.values(EnvironmentName);
export const alertSeverityValues = Object.values(AlertSeverity);
export const alertDestinationValues = Object.values(AlertDestination);
export const metricTypeValues = Object.values(MetricType);
export const tenancyModelValues = Object.values(TenancyModel);
export const serviceTopologyValues = Object.values(ServiceTopology);
export const paginationStyleValues = Object.values(PaginationStyle);
export const sortOrderValues = Object.values(SortOrder);
export const parameterKindValues = Object.values(ParameterKind);
export const idempotencyModeValues = Object.values(IdempotencyMode);
export const authorizationTypeValues = Object.values(AuthorizationType);
export const ownershipScopeValues = Object.values(OwnershipScope);
export const logicStepTypeValues = Object.values(LogicStepType);
export const syncProtocolValues = Object.values(SyncProtocol);
export const integrationAuthTypeValues = Object.values(IntegrationAuthType);
export const irRootFileValues = Object.values(IrRootFile);
export const irModuleRelativePatternValues = Object.values(IrModuleRelativePattern);
