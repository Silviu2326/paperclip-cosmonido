# Inventario global de rutas de Paperclip

Fecha: 2026-10-22. Fuente: `../paperclip-int/ui/src/App.tsx`, checkout local `integracion`.

Apéndice de la [revisión de producto](2026-10-22-revision-paginas-reducir-sin-empeorar.md). Inventario extraído del AST: incluye todas las declaraciones Route de este archivo, también layouts, índices, alternativas por flag y redirecciones. **El número de declaraciones no es el número de páginas.** Las rutas de boardRoutes se montan bajo la empresa y sus variantes de shell; las expresiones conservan gates y modos para poder inspeccionarlos. Las páginas de plugins se resuelven dinámicamente: su contenido depende de instalaciones y no puede enumerarse aquí.

La decisión de conservar/absorber/contextualizar corresponde a las tablas de familias del documento principal. Este apéndice permite comprobar que una URL no queda fuera por no aparecer en la sidebar; no acredita funcionamiento en producción ni que todos los componentes auxiliares sean pantallas. No se borran aliases por el mero hecho de ser aliases.

| Línea App.tsx | Ámbito | Path declarado | Elemento / gate | Tipo estructural |
| --- | --- | --- | --- | --- |
| 218 | boardRoutes | (index) | {<Navigate to="dashboard" replace />} | Alias / selección de destino |
| 219 | boardRoutes | dashboard | {<Dashboard />} | Pantalla, modo o flujo; ver decisión por familia |
| 220 | boardRoutes | dashboard/live | {<DashboardLive />} | Pantalla, modo o flujo; ver decisión por familia |
| 221 | boardRoutes | timeline | {streamlinedUiEnabled ? <AuditCompatibilityRedirect to="/activity/timeline" /> : <Timeline />} | Redirección mediante componente |
| 225 | boardRoutes | onboarding | {<OnboardingRoutePage />} | Pantalla, modo o flujo; ver decisión por familia |
| 226 | boardRoutes | companies | {<Companies />} | Pantalla, modo o flujo; ver decisión por familia |
| 227 | boardRoutes | company/settings | {<CompanySettings />} | Pantalla, modo o flujo; ver decisión por familia |
| 228 | boardRoutes | company/settings/connections | {<CompanyConnections />} | Pantalla, modo o flujo; ver decisión por familia |
| 229 | boardRoutes | company/settings/environments | {<Navigate to="/company/settings/instance/environments" replace />} | Alias / selección de destino |
| 230 | boardRoutes | company/settings/cloud-upstream | {<Navigate to="/company/export" replace />} | Alias / selección de destino |
| 231 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="company.members" />} | Layout / gate |
| 232 | boardRoutes | company/settings/members | {<CompanyAccess />} | Pantalla, modo o flujo; ver decisión por familia |
| 233 | boardRoutes | company/settings/access | {<CompanyAccessLegacyRoute />} | Pantalla, modo o flujo; ver decisión por familia |
| 237 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="company.invites" />} | Layout / gate |
| 238 | boardRoutes | company/settings/invites | {<Navigate to="/company/settings/members?tab=invites" replace />} | Alias / selección de destino |
| 243 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="company.export" />} | Layout / gate |
| 244 | boardRoutes | company/export/* | {( <Suspense fallback={<RobotLoading />}> <CompanyExport /> </Suspense> )} | Pantalla, modo o flujo; ver decisión por familia |
| 253 | boardRoutes | (layout sin path) | {<CloudManagedPageGate />} | Layout / gate |
| 254 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="company.import" />} | Layout / gate |
| 255 | boardRoutes | company/import | {<CompanyImport />} | Pantalla, modo o flujo; ver decisión por familia |
| 258 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="company.secrets" />} | Layout / gate |
| 259 | boardRoutes | company/settings/secrets | {<Secrets />} | Pantalla, modo o flujo; ver decisión por familia |
| 261 | boardRoutes | company/settings/tools | {<LegacyToolsSettingsRedirect />} | Redirección mediante componente |
| 262 | boardRoutes | company/settings/tools/:tab | {<LegacyToolsSettingsRedirect />} | Redirección mediante componente |
| 263 | boardRoutes | tools | {<LegacyToolsRedirect />} | Redirección mediante componente |
| 264 | boardRoutes | tools/:tab | {<LegacyToolsRedirect />} | Redirección mediante componente |
| 265 | boardRoutes | apps | {<Browse />} | Pantalla, modo o flujo; ver decisión por familia |
| 266 | boardRoutes | apps/assistant-connection | {<AssistantConnection />} | Pantalla, modo o flujo; ver decisión por familia |
| 267 | boardRoutes | apps/browse | {<Navigate to="/apps" replace />} | Alias / selección de destino |
| 268 | boardRoutes | apps/connections | {<Navigate to="/apps" replace />} | Alias / selección de destino |
| 269 | boardRoutes | apps/byo | {<AppsConnect byoOnly />} | Pantalla, modo o flujo; ver decisión por familia |
| 270 | boardRoutes | apps/vercel-connect | {<AppsConnectEntryRoute credentialSource="vercel_connect" />} | Pantalla, modo o flujo; ver decisión por familia |
| 274 | boardRoutes | apps/connect | {<AppsConnectEntryRoute />} | Pantalla, modo o flujo; ver decisión por familia |
| 275 | boardRoutes | apps/chat/connect | { <ChatConnectorsExperimentalGate><ChatEndpointSetup /></ChatConnectorsExperimentalGate> } | Pantalla, modo o flujo; ver decisión por familia |
| 278 | boardRoutes | apps/chat/:endpointId | { <ChatConnectorsExperimentalGate><Navigate to="settings" replace /></ChatConnectorsExperimentalGate> } | Alias / selección de destino |
| 281 | boardRoutes | apps/chat/:endpointId/reviews/:reviewId | { <ChatConnectorsExperimentalGate><ChatEndpointDetail /></ChatConnectorsExperimentalGate> } | Pantalla, modo o flujo; ver decisión por familia |
| 284 | boardRoutes | apps/chat/:endpointId/:tab | { <ChatConnectorsExperimentalGate><ChatEndpointDetail /></ChatConnectorsExperimentalGate> } | Pantalla, modo o flujo; ver decisión por familia |
| 287 | boardRoutes | apps/connect/:appKey | {<Navigate to="/apps" replace />} | Alias / selección de destino |
| 288 | boardRoutes | apps/connect/:appKey/:stage | {<Navigate to="/apps" replace />} | Alias / selección de destino |
| 289 | boardRoutes | apps/review | {<AppsReview />} | Pantalla, modo o flujo; ver decisión por familia |
| 291 | boardRoutes | apps/attention | {<Navigate to="/apps" replace />} | Alias / selección de destino |
| 292 | boardRoutes | apps/gateways | {<GatewaysList />} | Pantalla, modo o flujo; ver decisión por familia |
| 293 | boardRoutes | apps/gateways/:gatewayId | {<Navigate to="overview" replace />} | Alias / selección de destino |
| 294 | boardRoutes | apps/gateways/:gatewayId/:tab | {<GatewayDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 295 | boardRoutes | apps/advanced | {<AdvancedToolsRoute />} | Pantalla, modo o flujo; ver decisión por familia |
| 296 | boardRoutes | apps/advanced/gateways | {<GatewaysList />} | Pantalla, modo o flujo; ver decisión por familia |
| 297 | boardRoutes | apps/advanced/profiles/new | {<ProfileWizardRoute mode="new" />} | Pantalla, modo o flujo; ver decisión por familia |
| 298 | boardRoutes | apps/advanced/profiles/:profileId/edit | {<ProfileWizardRoute mode="edit" />} | Pantalla, modo o flujo; ver decisión por familia |
| 299 | boardRoutes | apps/advanced/profiles/:profileId | {<ProfileDetailRoute />} | Pantalla, modo o flujo; ver decisión por familia |
| 300 | boardRoutes | apps/advanced/audit | {<Navigate to="/apps" replace />} | Alias / selección de destino |
| 301 | boardRoutes | apps/advanced/run-your-own | {<Navigate to="/apps" replace />} | Alias / selección de destino |
| 302 | boardRoutes | apps/advanced/:tab | {<AdvancedToolsRoute />} | Pantalla, modo o flujo; ver decisión por familia |
| 303 | boardRoutes | apps/app/:applicationId | {<AppNotConnected />} | Pantalla, modo o flujo; ver decisión por familia |
| 304 | boardRoutes | apps/app/:applicationId/:tab | {<AppNotConnected />} | Pantalla, modo o flujo; ver decisión por familia |
| 305 | boardRoutes | apps/:connectionId | {<Navigate to="permissions" replace />} | Alias / selección de destino |
| 306 | boardRoutes | apps/:connectionId/:tab | {<AppDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 307 | boardRoutes | company/settings/instance | {<Navigate to="/company/settings" replace />} | Alias / selección de destino |
| 308 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="instance.profile" />} | Layout / gate |
| 309 | boardRoutes | company/settings/instance/profile | {<ProfileSettings />} | Pantalla, modo o flujo; ver decisión por familia |
| 311 | boardRoutes | company/settings/instance/general | {<Navigate to="/company/settings" replace />} | Alias / selección de destino |
| 312 | boardRoutes | company/settings/instance/heartbeats | {<Navigate to="/company/settings" replace />} | Alias / selección de destino |
| 313 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="instance.environments" />} | Layout / gate |
| 314 | boardRoutes | company/settings/instance/environments | {<CompanyEnvironments />} | Pantalla, modo o flujo; ver decisión por familia |
| 315 | boardRoutes | company/settings/instance/environments/new | {<CompanyEnvironments mode="create" />} | Pantalla, modo o flujo; ver decisión por familia |
| 316 | boardRoutes | company/settings/instance/environments/:environmentId/edit | {<CompanyEnvironments mode="edit" />} | Pantalla, modo o flujo; ver decisión por familia |
| 318 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="instance.access" />} | Layout / gate |
| 319 | boardRoutes | company/settings/instance/access | {<InstanceAccess />} | Pantalla, modo o flujo; ver decisión por familia |
| 321 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="instance.experimental" />} | Layout / gate |
| 322 | boardRoutes | company/settings/instance/experimental | {<InstanceExperimentalSettings />} | Pantalla, modo o flujo; ver decisión por familia |
| 324 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="instance.plugins" />} | Layout / gate |
| 325 | boardRoutes | company/settings/instance/plugins | {<PluginManager />} | Pantalla, modo o flujo; ver decisión por familia |
| 326 | boardRoutes | company/settings/instance/plugins/:pluginId | {<PluginSettings />} | Pantalla, modo o flujo; ver decisión por familia |
| 328 | boardRoutes | (layout sin path) | {<HiddenSettingsPageGate pageKey="instance.adapters" />} | Layout / gate |
| 329 | boardRoutes | company/settings/instance/adapters | {<AdapterManager />} | Pantalla, modo o flujo; ver decisión por familia |
| 331 | boardRoutes | company/settings/:settingsRoutePath/* | {<CompanySettingsPluginPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 332 | boardRoutes | skills/sources | {<SkillSources />} | Pantalla, modo o flujo; ver decisión por familia |
| 333 | boardRoutes | skills/sources/:sourceId | {<SkillSources />} | Pantalla, modo o flujo; ver decisión por familia |
| 334 | boardRoutes | skills/studio | {<SkillStudio />} | Pantalla, modo o flujo; ver decisión por familia |
| 335 | boardRoutes | skills/studio/new | {<SkillStudio />} | Pantalla, modo o flujo; ver decisión por familia |
| 336 | boardRoutes | skills/studio/:skillId | {<SkillStudio />} | Pantalla, modo o flujo; ver decisión por familia |
| 337 | boardRoutes | skills/:skillId/studio | {<LegacySkillStudioRedirect />} | Redirección mediante componente |
| 338 | boardRoutes | skills/* | {streamlinedUiEnabled ? <CompanySkills /> : <ProductionSurface><ProductionCompanySkills /></ProductionSurface>} | Pantalla, modo o flujo; ver decisión por familia |
| 342 | boardRoutes | settings | {<LegacySettingsRedirect />} | Redirección mediante componente |
| 343 | boardRoutes | settings/* | {<LegacySettingsRedirect />} | Redirección mediante componente |
| 344 | boardRoutes | plugins/:pluginId | {<PluginPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 345 | boardRoutes | org | {streamlinedUiEnabled ? <Navigate to="/agents/all" replace /> : <ProductionSurface><ProductionOrgChart /></ProductionSurface>} | Alias / selección de destino |
| 349 | boardRoutes | agents | {<Navigate to="/agents/all" replace />} | Alias / selección de destino |
| 351 | boardRoutes | {agents/${tab}} | {streamlinedUiEnabled ? <Agents /> : <ProductionSurface><ProductionAgents /></ProductionSurface>} | Pantalla, modo o flujo; ver decisión por familia |
| 357 | boardRoutes | agents/new | {<NewAgent />} | Pantalla, modo o flujo; ver decisión por familia |
| 358 | boardRoutes | agents/:agentId | {<AgentDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 359 | boardRoutes | agents/:agentId/:tab | {<AgentDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 360 | boardRoutes | agents/:agentId/runs/:runId | {<AgentDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 361 | boardRoutes | projects | {<Projects />} | Pantalla, modo o flujo; ver decisión por familia |
| 362 | boardRoutes | projects/:projectId | {<ProjectDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 363 | boardRoutes | projects/:projectId/overview | {<ProjectDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 364 | boardRoutes | projects/:projectId/issues | {<ProjectDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 365 | boardRoutes | projects/:projectId/issues/:filter | {<ProjectDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 366 | boardRoutes | (layout sin path) | {<IsolatedWorkspacesRouteGate />} | Layout / gate |
| 367 | boardRoutes | projects/:projectId/workspaces/:workspaceId | {<ProjectWorkspaceDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 369 | boardRoutes | projects/:projectId/workspaces | {<ProjectDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 370 | boardRoutes | projects/:projectId/configuration | {<ProjectDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 371 | boardRoutes | projects/:projectId/budget | {<ProjectDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 372 | boardRoutes | (layout sin path) | {<IsolatedWorkspacesRouteGate />} | Layout / gate |
| 373 | boardRoutes | workspaces | {<Workspaces />} | Pantalla, modo o flujo; ver decisión por familia |
| 375 | boardRoutes | issues | {<Issues />} | Pantalla, modo o flujo; ver decisión por familia |
| 376 | boardRoutes | tasks | {<BoardRouteRedirect to="/issues" />} | Redirección mediante componente |
| 377 | boardRoutes | search | {<Search />} | Pantalla, modo o flujo; ver decisión por familia |
| 381 | boardRoutes | issues/all | {<TaskViewRedirect view="all" />} | Redirección mediante componente |
| 382 | boardRoutes | issues/active | {<TaskViewRedirect view="active" />} | Redirección mediante componente |
| 383 | boardRoutes | issues/backlog | {<TaskViewRedirect view="backlog" />} | Redirección mediante componente |
| 384 | boardRoutes | issues/done | {<TaskViewRedirect view="done" />} | Redirección mediante componente |
| 385 | boardRoutes | issues/recent | {<TaskViewRedirect view="recent" />} | Redirección mediante componente |
| 389 | boardRoutes | issues/all | {<BoardRouteRedirect to="/issues" />} | Redirección mediante componente |
| 390 | boardRoutes | issues/active | {<BoardRouteRedirect to="/issues" />} | Redirección mediante componente |
| 391 | boardRoutes | issues/backlog | {<BoardRouteRedirect to="/issues" />} | Redirección mediante componente |
| 392 | boardRoutes | issues/done | {<BoardRouteRedirect to="/issues" />} | Redirección mediante componente |
| 393 | boardRoutes | issues/recent | {<BoardRouteRedirect to="/issues" />} | Redirección mediante componente |
| 396 | boardRoutes | chats | {<AgentChats />} | Pantalla, modo o flujo; ver decisión por familia |
| 397 | boardRoutes | chats/:agentRef | {<AgentChat />} | Pantalla, modo o flujo; ver decisión por familia |
| 398 | boardRoutes | issues/:issueId | {<IssueDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 400 | boardRoutes | tests/perf/long-thread | {<IssueChatLongThreadPerf />} | Pantalla, modo o flujo; ver decisión por familia |
| 402 | boardRoutes | routines | {streamlinedUiEnabled ? <Routines /> : <ProductionSurface><ProductionRoutines /></ProductionSurface>} | Pantalla, modo o flujo; ver decisión por familia |
| 403 | boardRoutes | cases | {<CasesExperimentalGate><Cases /></CasesExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 407 | boardRoutes | cases/:caseIdentifier | {<CasesExperimentalGate><CaseDetail /></CasesExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 411 | boardRoutes | status | {<StatusCardsExperimentalGate><StatusCards /></StatusCardsExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 415 | boardRoutes | status/:cardId | {<StatusCardsExperimentalGate><StatusCards /></StatusCardsExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 420 | boardRoutes | status-cards | {<StatusCardsLegacyRedirect />} | Redirección mediante componente |
| 421 | boardRoutes | status-cards/:cardId | {<StatusCardsLegacyRedirect />} | Redirección mediante componente |
| 422 | boardRoutes | review-queue | {<PipelinesExperimentalGate><ReviewQueue /></PipelinesExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 426 | boardRoutes | learnings | {<PipelinesExperimentalGate><Learnings /></PipelinesExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 430 | boardRoutes | pipelines | {<PipelinesExperimentalGate><Pipelines /></PipelinesExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 434 | boardRoutes | pipelines/:pipelineId | {<PipelinesExperimentalGate><Pipelines /></PipelinesExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 438 | boardRoutes | pipelines/:pipelineId/add | {<PipelinesExperimentalGate><Pipelines /></PipelinesExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 442 | boardRoutes | pipelines/:pipelineId/settings | {<PipelinesExperimentalGate><PipelineSettings /></PipelinesExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 446 | boardRoutes | pipelines/:pipelineId/items/:caseId | {<PipelinesExperimentalGate><PipelineItemDetail /></PipelinesExperimentalGate>} | Pantalla, modo o flujo; ver decisión por familia |
| 450 | boardRoutes | pipelines/:pipelineId/cases/:caseId | {<PipelinesExperimentalGate><PipelineItemLegacyRedirect /></PipelinesExperimentalGate>} | Redirección mediante componente |
| 454 | boardRoutes | routines/:routineId | {streamlinedUiEnabled ? <RoutineDetail /> : <ProductionSurface><ProductionRoutineDetail /></ProductionSurface>} | Pantalla, modo o flujo; ver decisión por familia |
| 455 | boardRoutes | routines/:routineId/:section | {streamlinedUiEnabled ? <RoutineDetail /> : <ProductionSurface><ProductionRoutineDetail /></ProductionSurface>} | Pantalla, modo o flujo; ver decisión por familia |
| 456 | boardRoutes | (layout sin path) | {<IsolatedWorkspacesRouteGate />} | Layout / gate |
| 457 | boardRoutes | (layout sin path) | {<ExecutionWorkspaceCompanyGate />} | Layout / gate |
| 458 | boardRoutes | execution-workspaces/:workspaceId | {<ExecutionWorkspaceDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 459 | boardRoutes | execution-workspaces/:workspaceId/services | {<ExecutionWorkspaceDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 460 | boardRoutes | execution-workspaces/:workspaceId/configuration | {<ExecutionWorkspaceDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 461 | boardRoutes | execution-workspaces/:workspaceId/runtime-logs | {<ExecutionWorkspaceDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 462 | boardRoutes | execution-workspaces/:workspaceId/issues | {<ExecutionWorkspaceDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 463 | boardRoutes | execution-workspaces/:workspaceId/routines | {<ExecutionWorkspaceDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 466 | boardRoutes | office | {<Office />} | Pantalla, modo o flujo; ver decisión por familia |
| 467 | boardRoutes | context | {<BoardRouteRedirect to="/artifacts/context" />} | Redirección mediante componente |
| 468 | boardRoutes | goals | {<Goals />} | Pantalla, modo o flujo; ver decisión por familia |
| 469 | boardRoutes | assignments | {<Assignments />} | Pantalla, modo o flujo; ver decisión por familia |
| 470 | boardRoutes | productization | {<Productization />} | Pantalla, modo o flujo; ver decisión por familia |
| 471 | boardRoutes | company/settings/navigation | {<NavigationPreferences />} | Pantalla, modo o flujo; ver decisión por familia |
| 472 | boardRoutes | company/settings/language | {<LanguageSettings />} | Pantalla, modo o flujo; ver decisión por familia |
| 473 | boardRoutes | company/settings/notifications | {<NotificationSettings view="preferences" />} | Pantalla, modo o flujo; ver decisión por familia |
| 474 | boardRoutes | company/settings/security | {<SecuritySettings section="access" />} | Pantalla, modo o flujo; ver decisión por familia |
| 475 | boardRoutes | company/settings/retention | {<SecuritySettings section="retention" />} | Pantalla, modo o flujo; ver decisión por familia |
| 476 | boardRoutes | company/settings/account-deletion | {<SecuritySettings section="account" />} | Pantalla, modo o flujo; ver decisión por familia |
| 477 | boardRoutes | company/settings/accounts | {<ProductAccounts />} | Pantalla, modo o flujo; ver decisión por familia |
| 478 | boardRoutes | company/settings/billing | {<ProductBilling />} | Pantalla, modo o flujo; ver decisión por familia |
| 479 | boardRoutes | company/settings/developer | {<PublicApiSettings />} | Pantalla, modo o flujo; ver decisión por familia |
| 480 | boardRoutes | company/settings/installations | {<AgencyWorkspace />} | Pantalla, modo o flujo; ver decisión por familia |
| 481 | boardRoutes | inbox/notifications | {<NotificationSettings view="inbox" />} | Pantalla, modo o flujo; ver decisión por familia |
| 482 | boardRoutes | notifications/:sourceType/:sourceId | {<NotificationAction />} | Pantalla, modo o flujo; ver decisión por familia |
| 483 | boardRoutes | business-builder | {<BusinessBuilder />} | Pantalla, modo o flujo; ver decisión por familia |
| 484 | boardRoutes | outcome-metrics | {<OutcomeMetrics />} | Pantalla, modo o flujo; ver decisión por familia |
| 485 | boardRoutes | public-catalog | {<PublicCatalog />} | Pantalla, modo o flujo; ver decisión por familia |
| 486 | boardRoutes | portable-catalog | {<PortableCatalog />} | Pantalla, modo o flujo; ver decisión por familia |
| 487 | boardRoutes | media-queue | {<BoardRouteRedirect to="/artifacts/media/queue" />} | Redirección mediante componente |
| 488 | boardRoutes | media-templates | {<BoardRouteRedirect to="/artifacts/media/new" />} | Redirección mediante componente |
| 489 | boardRoutes | assignments/:id | {<AssignmentDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 490 | boardRoutes | playbooks | {<Playbooks />} | Pantalla, modo o flujo; ver decisión por familia |
| 491 | boardRoutes | playbooks/:id | {<PlaybookDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 492 | boardRoutes | autonomy | {<Autonomy />} | Pantalla, modo o flujo; ver decisión por familia |
| 493 | boardRoutes | goals/:goalId | {<GoalDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 494 | boardRoutes | (layout sin path) | {<CustomersNavigation />} | Layout / gate |
| 495 | boardRoutes | customers | {<Customers />} | Pantalla, modo o flujo; ver decisión por familia |
| 496 | boardRoutes | customers/contacts | {<Contacts />} | Pantalla, modo o flujo; ver decisión por familia |
| 497 | boardRoutes | customers/contacts/import | {<ContactImport />} | Pantalla, modo o flujo; ver decisión por familia |
| 498 | boardRoutes | customers/services | {<ServiceAgreements />} | Pantalla, modo o flujo; ver decisión por familia |
| 499 | boardRoutes | customers/services/:id | {<ServiceAgreementDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 500 | boardRoutes | customers/:customerId | {<CustomerDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 502 | boardRoutes | (layout sin path) | {<SalesNavigation />} | Layout / gate |
| 503 | boardRoutes | sales | {<BoardRouteRedirect to="/sales/leads" />} | Redirección mediante componente |
| 504 | boardRoutes | sales/leads | {<Leads />} | Pantalla, modo o flujo; ver decisión por familia |
| 505 | boardRoutes | sales/leads/:leadId | {<LeadDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 506 | boardRoutes | sales/opportunities | {<Opportunities />} | Pantalla, modo o flujo; ver decisión por familia |
| 507 | boardRoutes | sales/proposals | {<Proposals />} | Pantalla, modo o flujo; ver decisión por familia |
| 508 | boardRoutes | sales/proposals/:id | {<ProposalDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 509 | boardRoutes | sales/forms | {<LeadForms />} | Pantalla, modo o flujo; ver decisión por familia |
| 511 | boardRoutes | (layout sin path) | {<ConversationsNavigation />} | Layout / gate |
| 512 | boardRoutes | conversations | {<ConversationInbox />} | Pantalla, modo o flujo; ver decisión por familia |
| 513 | boardRoutes | conversations/calls | {<CrmPhone />} | Pantalla, modo o flujo; ver decisión por familia |
| 514 | boardRoutes | conversations/:conversationId | {<ConversationDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 515 | boardRoutes | schedule | {<Schedule />} | Pantalla, modo o flujo; ver decisión por familia |
| 517 | boardRoutes | apps/channels | {<ChannelsSettings />} | Pantalla, modo o flujo; ver decisión por familia |
| 518 | boardRoutes | apps/webchat | {<WebchatSettings />} | Pantalla, modo o flujo; ver decisión por familia |
| 519 | boardRoutes | apps/crm-sync | {<CrmSync />} | Pantalla, modo o flujo; ver decisión por familia |
| 521 | boardRoutes | product-accounts | {<BoardRouteRedirect to="/company/settings/accounts" />} | Redirección mediante componente |
| 522 | boardRoutes | product-billing | {<BoardRouteRedirect to="/company/settings/billing" />} | Redirección mediante componente |
| 523 | boardRoutes | product-security | {<BoardRouteRedirect to="/company/settings/security" />} | Redirección mediante componente |
| 524 | boardRoutes | notifications | {<BoardRouteRedirect to="/inbox/notifications" />} | Redirección mediante componente |
| 525 | boardRoutes | agency | {<BoardRouteRedirect to="/company/settings/installations" />} | Redirección mediante componente |
| 526 | boardRoutes | language-settings | {<BoardRouteRedirect to="/company/settings/language" />} | Redirección mediante componente |
| 527 | boardRoutes | public-api | {<BoardRouteRedirect to="/company/settings/developer" />} | Redirección mediante componente |
| 528 | boardRoutes | contact-import | {<BoardRouteRedirect to="/customers/contacts/import" />} | Redirección mediante componente |
| 529 | boardRoutes | lead-forms | {<BoardRouteRedirect to="/sales/forms" />} | Redirección mediante componente |
| 530 | boardRoutes | contacts | {<BoardRouteRedirect to="/customers/contacts" />} | Redirección mediante componente |
| 531 | boardRoutes | leads | {<BoardRouteRedirect to="/sales/leads" />} | Redirección mediante componente |
| 532 | boardRoutes | leads/:leadId | {<BoardRouteRedirect to="/sales/leads" param="leadId" />} | Redirección mediante componente |
| 533 | boardRoutes | opportunities | {<BoardRouteRedirect to="/sales/opportunities" />} | Redirección mediante componente |
| 534 | boardRoutes | proposals | {<BoardRouteRedirect to="/sales/proposals" />} | Redirección mediante componente |
| 535 | boardRoutes | proposals/:id | {<BoardRouteRedirect to="/sales/proposals" param="id" />} | Redirección mediante componente |
| 536 | boardRoutes | service-agreements | {<BoardRouteRedirect to="/customers/services" />} | Redirección mediante componente |
| 537 | boardRoutes | service-agreements/:id | {<BoardRouteRedirect to="/customers/services" param="id" />} | Redirección mediante componente |
| 538 | boardRoutes | channels-settings | {<BoardRouteRedirect to="/apps/channels" />} | Redirección mediante componente |
| 539 | boardRoutes | webchat-settings | {<BoardRouteRedirect to="/apps/webchat" />} | Redirección mediante componente |
| 540 | boardRoutes | crm-sync | {<BoardRouteRedirect to="/apps/crm-sync" />} | Redirección mediante componente |
| 541 | boardRoutes | crm-phone | {<BoardRouteRedirect to="/conversations/calls" />} | Redirección mediante componente |
| 542 | boardRoutes | (layout sin path) | {<FilesNavigation />} | Layout / gate |
| 543 | boardRoutes | artifacts | {<ArtifactsExplorer />} | Pantalla, modo o flujo; ver decisión por familia |
| 544 | boardRoutes | artifacts/in | {<ArtifactsExplorer />} | Pantalla, modo o flujo; ver decisión por familia |
| 545 | boardRoutes | artifacts/in/:folderId | {<ArtifactsExplorer />} | Pantalla, modo o flujo; ver decisión por familia |
| 546 | boardRoutes | artifacts/out | {<ArtifactsExplorer />} | Pantalla, modo o flujo; ver decisión por familia |
| 547 | boardRoutes | artifacts/out/:node | {<ArtifactsExplorer />} | Pantalla, modo o flujo; ver decisión por familia |
| 548 | boardRoutes | artifacts/context | {<Context />} | Pantalla, modo o flujo; ver decisión por familia |
| 549 | boardRoutes | artifacts/media/new | {<MediaTemplates />} | Pantalla, modo o flujo; ver decisión por familia |
| 550 | boardRoutes | artifacts/media/queue | {<MediaQueue />} | Pantalla, modo o flujo; ver decisión por familia |
| 552 | boardRoutes | approvals | {<Navigate to="/approvals/pending" replace />} | Alias / selección de destino |
| 553 | boardRoutes | approvals/pending | {<Approvals />} | Pantalla, modo o flujo; ver decisión por familia |
| 554 | boardRoutes | approvals/all | {<Approvals />} | Pantalla, modo o flujo; ver decisión por familia |
| 555 | boardRoutes | approvals/:approvalId | {<ApprovalDetail />} | Pantalla, modo o flujo; ver decisión por familia |
| 556 | boardRoutes | activity | {streamlinedUiEnabled ? <CompanyActivity /> : <ProductionSurface><ProductionCompanyActivity /></ProductionSurface>} | Pantalla, modo o flujo; ver decisión por familia |
| 559 | boardRoutes | activity/runs | {<AuditHub section="runs" />} | Pantalla, modo o flujo; ver decisión por familia |
| 560 | boardRoutes | activity/costs | {<AuditHub section="costs" />} | Pantalla, modo o flujo; ver decisión por familia |
| 561 | boardRoutes | activity/budgets | {<AuditHub section="budgets" />} | Pantalla, modo o flujo; ver decisión por familia |
| 562 | boardRoutes | activity/timeline | {<AuditHub section="timeline" />} | Pantalla, modo o flujo; ver decisión por familia |
| 563 | boardRoutes | audit | {<AuditCompatibilityRedirect to="/activity" forceAgentMode />} | Redirección mediante componente |
| 564 | boardRoutes | audit/activity | {<AuditCompatibilityRedirect to="/activity" />} | Redirección mediante componente |
| 565 | boardRoutes | audit/runs | {<AuditCompatibilityRedirect to="/activity/runs" />} | Redirección mediante componente |
| 566 | boardRoutes | audit/costs | {<AuditCompatibilityRedirect to="/activity/costs" />} | Redirección mediante componente |
| 567 | boardRoutes | audit/budgets | {<AuditCompatibilityRedirect to="/activity/budgets" />} | Redirección mediante componente |
| 568 | boardRoutes | audit/timeline | {<AuditCompatibilityRedirect to="/activity/timeline" />} | Redirección mediante componente |
| 569 | boardRoutes | runs | {<AuditCompatibilityRedirect to="/activity/runs" />} | Redirección mediante componente |
| 570 | boardRoutes | costs | {<AuditCompatibilityRedirect to="/activity/costs" />} | Redirección mediante componente |
| 571 | boardRoutes | budgets | {<AuditCompatibilityRedirect to="/activity/budgets" />} | Redirección mediante componente |
| 575 | boardRoutes | costs | {<Costs />} | Pantalla, modo o flujo; ver decisión por familia |
| 576 | boardRoutes | audit | {<Navigate to="/activity?mode=agents" replace />} | Alias / selección de destino |
| 579 | boardRoutes | (layout sin path) | {<ConferenceRoomChatGate />} | Layout / gate |
| 580 | boardRoutes | board-chat | {<BoardChat />} | Pantalla, modo o flujo; ver decisión por familia |
| 584 | boardRoutes | dev/task-chat-lab | {<TaskChatLab />} | Pantalla, modo o flujo; ver decisión por familia |
| 586 | boardRoutes | decisions | {<WhatNeedsMe />} | Pantalla, modo o flujo; ver decisión por familia |
| 587 | boardRoutes | decisions/queues/:key | {<DecisionQueuePage />} | Pantalla, modo o flujo; ver decisión por familia |
| 594 | boardRoutes | inbox | {<InboxRootRedirect />} | Redirección mediante componente |
| 595 | boardRoutes | inbox/mine | {<TaskViewRedirect view="mine" />} | Redirección mediante componente |
| 596 | boardRoutes | inbox/recent | {<TaskViewRedirect view="recent" />} | Redirección mediante componente |
| 597 | boardRoutes | inbox/unread | {<TaskViewRedirect view="unread" />} | Redirección mediante componente |
| 598 | boardRoutes | inbox/blocked | {<TaskViewRedirect view="blocked" />} | Redirección mediante componente |
| 599 | boardRoutes | inbox/all | {<TaskViewRedirect view="everything" />} | Redirección mediante componente |
| 600 | boardRoutes | inbox/new | {<TaskViewRedirect view="mine" />} | Redirección mediante componente |
| 604 | boardRoutes | inbox | {<InboxRootRedirect />} | Redirección mediante componente |
| 605 | boardRoutes | inbox/mine | {<Inbox />} | Pantalla, modo o flujo; ver decisión por familia |
| 606 | boardRoutes | inbox/recent | {<Inbox />} | Pantalla, modo o flujo; ver decisión por familia |
| 607 | boardRoutes | inbox/unread | {<Inbox />} | Pantalla, modo o flujo; ver decisión por familia |
| 608 | boardRoutes | inbox/blocked | {<Inbox />} | Pantalla, modo o flujo; ver decisión por familia |
| 609 | boardRoutes | inbox/all | {<Inbox />} | Pantalla, modo o flujo; ver decisión por familia |
| 610 | boardRoutes | inbox/new | {<Navigate to="/inbox/mine" replace />} | Alias / selección de destino |
| 613 | boardRoutes | inbox/requests | {<JoinRequestQueue />} | Pantalla, modo o flujo; ver decisión por familia |
| 614 | boardRoutes | u/:userSlug | {<UserProfile />} | Pantalla, modo o flujo; ver decisión por familia |
| 615 | boardRoutes | design-guide | {<DesignGuide />} | Pantalla, modo o flujo; ver decisión por familia |
| 616 | boardRoutes | instance/settings/adapters | {<AdapterManager />} | Pantalla, modo o flujo; ver decisión por familia |
| 617 | boardRoutes | :pluginRoutePath/* | {<PluginPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 618 | boardRoutes | * | {<NotFoundPage scope="board" />} | Pantalla, modo o flujo; ver decisión por familia |
| 956 | App | oauth-handoff | {<PaperclipCloudOAuthHandoffPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 957 | App | auth | {<AuthPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 958 | App | signup | {<AuthPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 959 | App | pricing | {<Pricing />} | Pantalla, modo o flujo; ver decisión por familia |
| 960 | App | catalog | {<PublicCatalog />} | Pantalla, modo o flujo; ver decisión por familia |
| 961 | App | billing | {<ProductBilling />} | Pantalla, modo o flujo; ver decisión por familia |
| 962 | App | portal/:portalId | {<PublicCustomerPortal />} | Pantalla, modo o flujo; ver decisión por familia |
| 963 | App | review/:companyId/:linkId | {<PublicReview />} | Pantalla, modo o flujo; ver decisión por familia |
| 964 | App | board-claim/:token | {<BoardClaimPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 965 | App | mcp-connect/:id | {<McpConnectPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 966 | App | dot-connect/:id | {<McpConnectPage agentPairingOnly />} | Pantalla, modo o flujo; ver decisión por familia |
| 967 | App | mcp-device | {<McpDevicePage />} | Pantalla, modo o flujo; ver decisión por familia |
| 968 | App | assistant-connections | {<AssistantConnectionsPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 969 | App | cli-auth/:id | {<CliAuthPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 970 | App | invite/:token | {<InviteLandingPage />} | Pantalla, modo o flujo; ver decisión por familia |
| 971 | App | (layout sin path) | {<CloudAccessGate allowMembershipRequest />} | Layout / gate |
| 972 | App | (layout sin path) | {streamlinedUiLoaded ? <Outlet /> : <RobotLoading />} | Layout / gate |
| 975 | App | chat-identity/confirm | {<ChatIdentityConfirm />} | Pantalla, modo o flujo; ver decisión por familia |
| 978 | App | tests/perf/long-thread | {<IssueChatLongThreadPerf />} | Pantalla, modo o flujo; ver decisión por familia |
| 979 | App | ux-lab/bootstrap-setup | {<BootstrapSetupUxLab />} | Pantalla, modo o flujo; ver decisión por familia |
| 980 | App | ux-lab/responsible-user-denial | {<ResponsibleUserDenialUxLab />} | Pantalla, modo o flujo; ver decisión por familia |
| 981 | App | ux-lab/cross-issue-collaboration | {<CrossIssueCollaborationUxLab />} | Pantalla, modo o flujo; ver decisión por familia |
| 983 | App | (layout sin path) | {<CloudAccessGate />} | Layout / gate |
| 984 | App | (layout sin path) | {streamlinedUiLoaded ? <Outlet /> : <RobotLoading />} | Layout / gate |
| 985 | App | (index) | {<CompanyRootRedirect />} | Redirección mediante componente |
| 986 | App | onboarding | {<OnboardingRoutePage />} | Pantalla, modo o flujo; ver decisión por familia |
| 987 | App | instance | {<LegacySettingsRedirect />} | Redirección mediante componente |
| 988 | App | instance/settings | {<LegacySettingsRedirect />} | Redirección mediante componente |
| 989 | App | instance/settings/* | {<LegacySettingsRedirect />} | Redirección mediante componente |
| 990 | App | companies | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 991 | App | issues | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 992 | App | tasks | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 993 | App | issues/:issueId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 994 | App | routines | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 995 | App | routines/:routineId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 996 | App | review-queue | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 997 | App | learnings | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 998 | App | cases | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 999 | App | cases/:caseIdentifier | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1000 | App | status | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1001 | App | status/:cardId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1002 | App | status-cards | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1003 | App | status-cards/:cardId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1004 | App | pipelines | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1005 | App | pipelines/:pipelineId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1006 | App | pipelines/:pipelineId/add | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1007 | App | pipelines/:pipelineId/settings | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1008 | App | pipelines/:pipelineId/items/:caseId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1009 | App | pipelines/:pipelineId/cases/:caseId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1010 | App | artifacts | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1011 | App | artifacts/* | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1012 | App | office | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1013 | App | context | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1014 | App | assignments | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1015 | App | productization | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1016 | App | product-security | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1017 | App | notifications | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1018 | App | language-settings | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1019 | App | public-api | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1020 | App | media-queue | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1021 | App | contact-import | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1022 | App | product-accounts | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1023 | App | product-billing | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1024 | App | business-builder | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1025 | App | outcome-metrics | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1026 | App | media-templates | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1027 | App | portable-catalog | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1028 | App | lead-forms | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1029 | App | assignments/:id | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1030 | App | playbooks | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1031 | App | playbooks/:id | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1032 | App | autonomy | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1033 | App | proposals | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1034 | App | proposals/:id | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1035 | App | service-agreements | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1036 | App | service-agreements/:id | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1037 | App | customers | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1038 | App | customers/* | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1039 | App | customers/:customerId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1040 | App | contacts | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1041 | App | leads | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1042 | App | leads/:leadId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1043 | App | opportunities | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1044 | App | conversations | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1045 | App | conversations/:conversationId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1046 | App | schedule | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1047 | App | crm-sync | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1048 | App | crm-phone | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1049 | App | sales/* | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1050 | App | agency | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1051 | App | public-catalog | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1052 | App | notifications/:sourceType/:sourceId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1053 | App | channels-settings | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1054 | App | webchat-settings | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1055 | App | audit | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1058 | App | audit/* | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1059 | App | activity | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1060 | App | activity/* | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1061 | App | runs | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1062 | App | costs | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1063 | App | budgets | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1066 | App | decisions | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1067 | App | u/:userSlug | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1068 | App | skills/studio | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1069 | App | skills/studio/new | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1070 | App | skills/studio/:skillId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1071 | App | skills/:skillId/studio | {<LegacySkillStudioRedirect />} | Redirección mediante componente |
| 1072 | App | skills/* | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1073 | App | settings | {<LegacySettingsRedirect />} | Redirección mediante componente |
| 1074 | App | settings/* | {<LegacySettingsRedirect />} | Redirección mediante componente |
| 1075 | App | agents | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1077 | App | {agents/${tab}} | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1079 | App | agents/new | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1080 | App | agents/:agentId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1081 | App | agents/:agentId/:tab | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1082 | App | agents/:agentId/runs/:runId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1083 | App | projects | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1084 | App | projects/:projectId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1085 | App | projects/:projectId/overview | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1086 | App | projects/:projectId/issues | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1087 | App | projects/:projectId/issues/:filter | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1088 | App | projects/:projectId/workspaces | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1089 | App | projects/:projectId/workspaces/:workspaceId | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1090 | App | projects/:projectId/configuration | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1091 | App | workspaces | {<UnprefixedBoardRedirect />} | Redirección mediante componente |
| 1092 | App | execution-workspaces/:workspaceId | {<UnprefixedExecutionWorkspaceRedirect />} | Redirección mediante componente |
| 1093 | App | execution-workspaces/:workspaceId/services | {<UnprefixedExecutionWorkspaceRedirect />} | Redirección mediante componente |
| 1094 | App | execution-workspaces/:workspaceId/configuration | {<UnprefixedExecutionWorkspaceRedirect />} | Redirección mediante componente |
| 1095 | App | execution-workspaces/:workspaceId/runtime-logs | {<UnprefixedExecutionWorkspaceRedirect />} | Redirección mediante componente |
| 1096 | App | execution-workspaces/:workspaceId/issues | {<UnprefixedExecutionWorkspaceRedirect />} | Redirección mediante componente |
| 1097 | App | execution-workspaces/:workspaceId/routines | {<UnprefixedExecutionWorkspaceRedirect />} | Redirección mediante componente |
| 1098 | App | :companyPrefix | {<><ProductNotificationBridge />{streamlinedUiEnabled ? <Layout /> : <ProductionLayout />}</>} | Pantalla, modo o flujo; ver decisión por familia |
| 1101 | App | * | {<NotFoundPage scope="global" />} | Pantalla, modo o flujo; ver decisión por familia |
