# 5. Automatización: convertir repetición en infraestructura

Aquí es donde la curva se separa. El usuario promedio escribe buenos
prompts. El usuario god-tier escribe buenos prompts **una vez** y después
los invoca.

## Escala de compromiso

De más flexible a más rígido. Elegir el nivel correcto es la habilidad.

| Nivel | Qué es | Cuándo |
|---|---|---|
| Prompt | lo escribes cada vez | tarea única |
| `CLAUDE.md` | hecho siempre presente | contexto del proyecto |
| Slash command | prompt guardado, parametrizable | secuencia que repites |
| Skill | procedimiento con criterio, se carga solo | flujo con reglas y matices |
| Subagente | rol con su propio contexto y tools | trabajo delegable y acotado |
| Hook | código que corre sí o sí | regla mecánica, sin excepciones |
| Permisos | aprobación por adelantado | quitarte clicks de encima |

Regla de decisión: **¿esto necesita criterio?** Si sí → skill o command. Si
es puramente mecánico y no debe fallar nunca → hook. Los hooks no piensan,
y esa es exactamente su virtud.

## Slash commands

Un archivo `.md` en `.claude/commands/`. El nombre del archivo es el
comando.

`.claude/commands/auditar-seo.md`:

```markdown
---
description: Audita el SEO de una landing
argument-hint: <archivo.html>
allowed-tools: Bash(grep:*), Bash(sed:*), Read
---
Audita el SEO de @$1 y devuélveme SOLO una tabla:

| Chequeo | Estado | Valor actual |

Revisa: title (50-60 chars), meta description (150-160), og:title,
og:image, canonical, h1 único, alt en todas las <img>.

No edites nada. Solo reporta.
```

Y lo usas: `/auditar-seo energia.html`

Piezas clave:

- `$ARGUMENTS` — todo lo que escribiste después del comando.
- `$1`, `$2`, ... — argumentos posicionales.
- `@archivo` — inyecta el contenido de un archivo.
- `` !`comando` `` — ejecuta bash **antes** y mete la salida en el prompt.
- `allowed-tools` — limita qué puede hacer ese comando.

El `` !`comando` `` es el más subestimado. Te deja pre-cargar estado real
sin que el agente gaste turnos buscándolo:

```markdown
Estado actual:
!`git status --short`
!`git diff --stat main...HEAD`

Revisa estos cambios buscando bugs antes de que los commitee.
```

Los commands van en `.claude/commands/` (compartidos con el equipo, se
commitean) o `~/.claude/commands/` (personales, todos tus proyectos).

## Skills

Un slash command es un prompt que **tú** invocas. Una skill es un
procedimiento que **Claude** invoca cuando reconoce que aplica.

`.claude/skills/sync-catalogo/SKILL.md`:

```markdown
---
name: sync-catalogo
description: Regenerar el catálogo de la tienda desde YDC o R.ENZO. Usar
  cuando se pidan actualizar precios, sincronizar productos, o cuando algo
  en shop/assets/products*.js parezca desactualizado.
---
# Sync de catálogo

1. NUNCA editar products.js ni products-static.js a mano.
2. YDC → `python scripts/sync_products.py`
   R.ENZO → `python scripts/sync_renzo.py`
3. Revisar `git diff --stat` de la salida. Si cambian más de 50 productos,
   parar y avisar: probablemente cambió el formato del sheet.
4. Correcciones puntuales van en products-overrides.js, nunca en la salida.
```

La `description` es lo que decide si se activa. Escríbela pensando en las
palabras que **tú** usarías al pedirlo, no en las que un manual usaría.

Ventaja estructural: el cuerpo de la skill solo entra al contexto cuando se
activa. Puedes tener veinte skills detalladas sin pagar nada por las
diecinueve que no aplican.

## Hooks

Código que se ejecuta en momentos fijos del ciclo. No es una sugerencia al
modelo: es una garantía.

Eventos principales: `PreToolUse` (antes de una herramienta, puede
**bloquear**), `PostToolUse` (después — formatear, validar), `SessionStart`
(preparar entorno), `UserPromptSubmit` (inyectar contexto), `Stop`
(al terminar el turno).

Ejemplo que este repo pide a gritos — bloquear la edición de archivos
generados, en `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_input.file_path' | grep -qE 'products(-static)?\\.js$' && { echo 'BLOQUEADO: archivo generado. Usa products-overrides.js o edita el script de sync.' >&2; exit 2; } || exit 0"
      }]
    }]
  }
}
```

Salir con **código 2** bloquea la acción y le devuelve tu mensaje a Claude,
que corrige el rumbo solo. Esto convierte una regla que *pediste* en una
regla que *no se puede violar* — ni por ti a las 2am.

> Los hooks corren con tus permisos. Un hook mal escrito puede borrar
> archivos. Pruébalos con `echo` antes de ponerles dientes.

## Permisos: tu `settings.local.json` está mal

El que tienes hoy contiene entradas como:

```json
"Bash(sed -i 's/Plata Tech Solutions — Tecnología/.../g' index.html)"
```

Eso es una aprobación para **esa cadena literal exacta**. Nunca volverá a
coincidir con nada. Aprobaste un comando de una sola vez y quedó de basura
permanente.

El matching es **por prefijo**, con `:*` como comodín:

```json
{
  "permissions": {
    "allow": [
      "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
      "Bash(grep:*)", "Bash(rg:*)", "Bash(find:*)", "Bash(ls:*)",
      "Bash(sed -n:*)",
      "Bash(python scripts/sync_products.py:*)",
      "Bash(python scripts/sync_renzo.py:*)",
      "Read(./**)", "WebSearch"
    ],
    "deny": [
      "Read(./.env)", "Read(./**/.env*)",
      "Read(./supabase/.temp/**)",
      "Bash(git push --force:*)"
    ]
  }
}
```

Criterio: **allowlistea lo que es de solo lectura o trivialmente
reversible** (`git status`, `grep`, `sed -n`, `ls`). Deja que te pregunte
por lo destructivo o lo que sale a la red (`git push`, `rm`, `curl`
externo). `sed -i` — que edita en sitio — no debería estar en allow
genérico.

`deny` gana sobre `allow`. Es tu red de seguridad: pon ahí los secretos y
las operaciones irreversibles.

Capas: `~/.claude/settings.json` (tú, global) → `.claude/settings.json`
(proyecto, se commitea) → `.claude/settings.local.json` (proyecto, solo tú,
gitignore). Lo del equipo va en el del proyecto; tus atajos personales en
el local.

## MCP

Conecta herramientas externas (bases de datos, APIs, Figma, Sentry...) como
tools nativas. Para este proyecto el candidato obvio es Supabase: consultar
órdenes reales en vez de que Claude adivine el esquema desde el JS del
cliente.

Regla de higiene: cada servidor MCP mete sus definiciones de tools en el
contexto de **cada** sesión. Tres servidores conectados "por si acaso"
pueden costarte decenas de miles de tokens permanentes. Conecta lo que usas
esta semana, desconecta el resto.

## El ciclo de composición

```
haces algo a mano
  → lo haces dos veces           → línea en CLAUDE.md
    → lo haces cinco veces       → slash command
      → tiene matices y reglas   → skill
        → no debe fallar nunca   → hook
          → te pregunta siempre  → permiso
```

Cada sesión debería dejar la siguiente más barata. Si tu sesión #50 se
siente igual que la #1, no estás componiendo.
