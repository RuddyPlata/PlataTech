# 4. Workflows

Patrones repetibles. Cada uno resuelve una clase de problema; elegir el
correcto importa más que redactar bien.

## El bucle canónico: explorar → planear → ejecutar → verificar → entregar

El 80% del trabajo serio cabe aquí, y el error casi siempre es saltarse
una fase.

```
1. EXPLORAR   "Lee X e Y. No escribas código todavía. Explícame cómo funciona hoy."
2. PLANEAR    "Plan para lograr Z. Archivos, orden, riesgos. Sin código aún."
   → tú apruebas o corriges el plan (aquí es donde ganas o pierdes)
3. EJECUTAR   "Ejecuta el plan. Para si algo no calza con lo que asumimos."
4. VERIFICAR  "Corre <comando>. Muéstrame la salida."
5. ENTREGAR   "Commit con mensaje descriptivo en <rama>."
```

La fase 2 es la palanca. Corregir un plan cuesta una frase; corregir una
implementación cuesta una sesión.

## Plan mode

`Shift+Tab` cicla los modos de permiso; uno de ellos es **plan mode**: el
agente investiga y propone, pero no puede editar. Es la fase 1-2 con
garantía mecánica en vez de con buena fe.

Úsalo para: features nuevas, refactors, cualquier cosa que toque pagos o
checkout aquí. Sales del modo cuando el plan te convence.

El complemento es **auto-accept**: una vez el plan está aprobado y el
riesgo es bajo, dejas que ejecute sin pedirte permiso archivo por archivo.
La combinación *plan estricto → ejecución suelta* es el ritmo de máxima
productividad: pones toda tu atención donde decide, ninguna donde teclea.

## TDD dirigido (aunque no tengas tests)

El bucle más potente que existe con agentes, porque cierra la Ley 2.

```
1. "Escribe un test que falle para: <comportamiento>. NO escribas la
    implementación todavía."
2. "Córrelo. Confírmame que falla, y por la razón correcta."
3. "Ahora implementa hasta que pase. No modifiques el test."
4. "Córrelo de nuevo. Muéstrame la salida."
```

El paso 2 es no negociable: sin ver el rojo, no sabes si el test prueba
algo. El «no modifiques el test» del paso 3 tampoco — sin eso, un agente
atascado ajusta el test en vez del código.

Este repo no tiene runner de tests. Dos salidas:

- **Verificación por comando**: `grep`, `git diff`, comparar salida del
  sync antes/después. Es TDD pobre pero cierra el bucle.
- **Introducir tests donde duele**: las reglas de margen en
  `sync_products.py` son funciones puras sobre números. Son el candidato
  perfecto para un primer `pytest` — y el que más te ahorraría, porque un
  error ahí se propaga a todo el catálogo silenciosamente.

## Revisión con ojos frescos

Un agente es mal juez de su propio trabajo: tiene todo el razonamiento que
lo llevó ahí, y eso lo sesga a validarlo.

```
Sesión A: implementa la feature, commitea.
Sesión B (/clear o terminal nueva): "Revisa el diff de <rama> contra main.
         No lo escribiste tú. Busca bugs, casos borde y cosas que rompan
         producción. Sé escéptico."
```

Barato, y encuentra cosas reales. En este repo aplícalo sin excepción a
cualquier cambio en `supabase/functions/azul-*` — ahí un error no se ve,
se cobra.

## Paralelismo real: git worktrees

Varias sesiones sobre el mismo repo se pisan. Los worktrees les dan a cada
una su propio directorio compartiendo el historial:

```bash
git worktree add ../PlataTech-seo   claude/seo
git worktree add ../PlataTech-azul  claude/azul
# una terminal + una sesión de Claude en cada uno
```

Tres sesiones independientes, cero conflictos hasta el merge. El límite no
es la máquina: es cuántos diffs puedes revisar tú de verdad. Dos o tres es
realista; ocho es teatro.

## Headless: Claude como comando

```bash
claude -p "Lista las landings sin meta description. Solo la lista."
claude -p "Resume el diff de HEAD en una línea" --output-format json
```

Sirve para scripts, pre-commit, tareas programadas. Casa perfecto con tus
`.bat`: podrías hacer que después de `sync_products.py`, un `claude -p`
audite el diff generado y avise si algún precio se movió más de un umbral
razonable.

## Higiene de sesión

| Situación | Movimiento |
|---|---|
| Tarea nueva sin relación | `/clear` |
| Misma tarea, contexto lleno | `/compact <qué conservar>` |
| Va por mal camino | `Esc` — no esperes a que termine |
| Te arrepentiste del último prompt | `Esc` `Esc` para retroceder |
| Cerraste sin querer | `claude --continue` o `/resume` |
| ¿Cuánto contexto queda? | `/context` |
| ¿Cuánto llevo gastado? | `/cost` |

## Elegir workflow

| Tarea | Workflow |
|---|---|
| Typo, texto, un CSS | Directo. Nada de ceremonia. |
| Feature en una landing | Bucle canónico, plan corto |
| Tocar checkout/AZUL | Plan mode + sesión dedicada + revisión con ojos frescos |
| Bug con causa desconocida | `think hard` + evidencia cruda + bucle canónico |
| Auditoría del sitio | Subagente que devuelve tabla |
| Cambiar reglas de margen | Tests primero sobre la función pura, después el cambio |
| 3 cosas independientes | Worktrees |
