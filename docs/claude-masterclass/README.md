# Masterclass Claude Code — nivel operador

Material de la sesión-madre de PlataTech. No es documentación oficial:
es el manual de cómo **operar** el agente para que rinda al máximo.

## La tesis

La mayoría de la gente usa Claude Code como un chat que además edita
archivos. Eso es el 15% de la herramienta. El 85% restante aparece cuando
dejas de conversar y empiezas a **dirigir un bucle**: preparas el contexto,
defines qué significa "terminado", das una forma de verificarlo, y dejas
que itere.

La diferencia entre un usuario promedio y uno god-tier no es que escriba
prompts más bonitos. Es que gestiona tres recursos:

| Recurso | Se agota cuando | Se recupera con |
|---|---|---|
| **Contexto** | lees archivos que no necesitas | `/clear`, subagentes, `grep` en vez de `cat` |
| **Confianza** | el agente falla sin que lo notes | verificación automática (test, build, curl) |
| **Tu atención** | revisas cada línea a mano | permisos, hooks, planes aprobados por adelantado |

## Ruta

1. [Modelo mental](01-modelo-mental.md) — qué es realmente el bucle y por
   qué el contexto es la única moneda.
2. [Ingeniería de contexto](02-contexto.md) — `CLAUDE.md`, `/clear`,
   `/compact`, subagentes. El multiplicador más grande.
3. [Prompting para agentes](03-prompting.md) — la anatomía de un prompt
   que no falla, con ejemplos sobre este repo.
4. [Workflows](04-workflows.md) — plan mode, TDD, worktrees paralelos,
   headless, revisión con ojos frescos.
5. [Automatización](05-automatizacion.md) — slash commands, skills, hooks,
   permisos, MCP. Convertir lo que repites en infraestructura.
6. [Fábrica de prompts](06-fabrica-de-prompts.md) — cómo esta sesión
   produce prompts para las sesiones hijas. Plantillas listas.

## Cómo usar esta sesión

Esta sesión (`claude/claude-masterclass-learning-303b63`) es la
**sesión-madre**: aquí analizas, decides y redactas prompts. No escribes
código de producción aquí. Los prompts salen de aquí y se ejecutan en
sesiones hijas limpias, una por tarea.

Ventaja: la sesión-madre acumula criterio sobre el proyecto sin
contaminarse con diffs, y las hijas empiezan con contexto limpio y una
instrucción quirúrgica.

> Las teclas y comandos exactos varían entre versiones de Claude Code.
> `/help` en tu terminal es la fuente de verdad para tu build.
