# 2. Ingeniería de contexto

El multiplicador más grande. Si solo aplicas un capítulo, que sea este.

## La jerarquía de memoria

Claude carga automáticamente, en cada turno:

| Archivo | Alcance | Se commitea |
|---|---|---|
| `~/.claude/CLAUDE.md` | todos tus proyectos | no |
| `./CLAUDE.md` | este proyecto, todo el equipo | **sí** |
| `./CLAUDE.local.md` | este proyecto, solo tú | no (gitignore) |
| `subdir/CLAUDE.md` | al tocar archivos de ese subdirectorio | sí |

Además puedes importar con `@ruta/al/archivo` dentro de un `CLAUDE.md`,
lo que permite mantener el principal corto y traer detalle solo cuando hace
falta.

Atajo: escribir una línea empezando con `#` en la sesión la propone para
guardarla en memoria. Úsalo en caliente, cuando corriges al agente por
segunda vez.

## Qué va y qué NO va en CLAUDE.md

`CLAUDE.md` se antepone a **cada turno**. Un `CLAUDE.md` de 400 líneas es
un impuesto permanente sobre toda la sesión, y peor: diluye lo importante.

**Sí va** (cosas que Claude no puede deducir o que le cuestan caro):
- Comandos exactos para correr, generar, previsualizar.
- Reglas invisibles en el código: *«`products.js` es generado, no editarlo»*.
- Prohibiciones con consecuencia: *«no reintroducir PayPal»*.
- Decisiones de negocio: las reglas de margen.
- Convenciones de estilo que no se ven en una muestra pequeña.

**No va:**
- Lo que se lee del código en 10 segundos («este archivo define la función X»).
- Un árbol de directorios completo (se lo consigue con `ls`).
- Filosofía genérica de programación («escribe código limpio»).
- Historia del proyecto.

Objetivo: **menos de 100 líneas**. El que escribimos para PlataTech tiene 74
y captura las tres trampas reales del repo (catálogo generado, márgenes,
AuthHash de AZUL).

`/init` genera un primer borrador automático. Sirve como punto de partida,
pero casi siempre hay que **recortarlo a la mitad** — tiende a describir lo
obvio en vez de lo peligroso.

## Las tres herramientas de higiene

### `/clear` — reinicio total
Gratis. Entre tareas no relacionadas, siempre. El coste de re-cargar
contexto relevante es mucho menor que el coste de arrastrar contexto sucio.

### `/compact` — resumir y seguir
Cuando la tarea sigue viva pero el contexto está lleno. Lo clave, y casi
nadie lo usa: **acepta instrucciones**.

```
/compact                                    # resumen genérico, mediocre
/compact conserva las decisiones sobre el AuthHash de AZUL y los archivos
         tocados; descarta la exploración del catálogo
```

Con instrucciones decides qué sobrevive. Sin ellas, el resumen conserva lo
reciente, no lo importante.

### `/context` — ver el gasto
Muestra en qué se está yendo la ventana. Si `CLAUDE.md` o el system prompt
ocupan una fracción visible, tienes un problema de diseño, no de uso.

## Subagentes: el truco de contexto que casi nadie usa

Un subagente corre en **su propia ventana de contexto** y te devuelve solo
su conclusión. La ganancia no es paralelismo — es que las 80k tokens de
búsqueda mueren con él.

Úsalo cuando: *"la respuesta es corta pero encontrarla es caro"*.

```
Lanza un subagente que revise las 11 landings de la raíz y me devuelva SOLO
una tabla: archivo | ¿tiene meta description? | ¿tiene og:image? | ¿largo del title?
No quiero el contenido de los archivos, solo la tabla.
```

Lee ~13.000 líneas. Te devuelve 12 filas. Tu contexto principal sigue limpio.

**No lo uses** cuando necesitas el detalle en tu contexto para seguir
trabajando — vas a pagar dos veces.

## Anclas: la optimización más barata que existe

Comparar:

```
❌ "arregla el precio del Redmi en la tienda"
✅ "en shop/assets/products-overrides.js, el override del SKU RN13-256
    tiene price: 18500 y debería ser 19500"
```

El primero cuesta 15-30k tokens de búsqueda y puede terminar editando el
archivo generado (error caro en este repo). El segundo cuesta ~500 y no
tiene ambigüedad.

**Toda ruta, símbolo o número que ya sepas y no escribas, se lo cobras al
agente en tokens de búsqueda y en riesgo de que adivine mal.**

Corolario práctico: cuando *tú* no sepas la ruta, el primer movimiento no
es un prompt vago — es un `grep` tuyo, o un subagente que la encuentre.

## Higiene aplicada a este repo

| Situación | Movimiento correcto |
|---|---|
| Buscar un producto | `grep -n "modelo" shop/assets/products*.js` |
| Entender una landing | `sed -n '1,80p' energia.html` (el `<head>`) — no el archivo |
| Auditar las 11 landings | subagente, devolviendo tabla |
| Cambiar reglas de margen | leer solo `scripts/sync_products.py`, no la salida |
| Tocar AZUL | `/clear` primero, sesión dedicada, spec a mano |
