# 6. La fábrica de prompts

El trabajo real de esta sesión-madre: convertir ideas vagas en prompts
quirúrgicos que se ejecutan en sesiones hijas limpias.

## Por qué separar madre e hijas

| | Sesión-madre (esta) | Sesión hija |
|---|---|---|
| Hace | analiza, decide, redacta prompts | ejecuta una tarea |
| Contexto | criterio acumulado del proyecto | limpio, mínimo, quirúrgico |
| Escribe código | no | sí |
| Vida | larga, se compacta | corta, se descarta |

La madre puede permitirse contexto largo porque no edita nada. Las hijas
son desechables: si una sale mal, la tiras y relanzas el prompt corregido —
no arrastras el error.

Regla: **una hija, una tarea, una rama.**

## El proceso, en cuatro pasos

### 1. Interrogar la idea

Antes de redactar nada, la madre debe poder responder:

- ¿Cuál es el resultado observable? (no la actividad — el resultado)
- ¿Qué archivos toca? ¿Cómo lo sé?
- ¿Qué NO debe tocar?
- ¿Cómo se comprueba que funcionó?
- ¿Qué pasa si sale mal en producción?

Si no puedes responder las cinco, el prompt no está listo. Ese es el
momento de investigar en la madre — `grep`, subagente, leer el script — no
de mandar a la hija a adivinar.

### 2. Calibrar el riesgo

| Riesgo | Señal | Prompt correspondiente |
|---|---|---|
| Bajo | texto, CSS, contenido | directo, deja que commitee |
| Medio | lógica de una landing, scripts | plan primero, muestra el diff |
| Alto | catálogo, checkout, AZUL, Supabase | plan mode, sin commit, revisión aparte |

En este repo: cualquier cosa que toque `supabase/functions/azul-*` o
`shop/assets/products*.js` es riesgo alto por defecto.

### 3. Redactar con las seis partes

Objetivo · Anclas · Restricciones · Hecho cuando · Verificación · Entrega.
(Capítulo 3.)

### 4. Entregar el prompt en bloque

La madre devuelve el prompt en un bloque de código, listo para pegar. Sin
comentarios alrededor, sin "aquí tienes tu prompt". Un bloque, copiable.

---

## Plantillas

### A — Feature

```
Rama: claude/<slug>

OBJETIVO
<resultado observable, una o dos frases>

CONTEXTO
Lee estos archivos antes de escribir nada:
- <ruta:líneas>
- <ruta>
Lee CLAUDE.md primero.

RESTRICCIONES
- No toques nada fuera de <directorio>.
- No agregues dependencias.
- No refactorices código existente que ya funciona.
- Si necesitas tocar más de <N> archivos, para y explícame por qué.

PLAN
Antes de escribir código, muéstrame: archivos a tocar, orden, y riesgos.
Espera mi OK.

HECHO CUANDO
- <criterio observable 1>
- <criterio observable 2>

VERIFICACIÓN
Corre `<comando>` y muéstrame la salida.

ENTREGA
Commit en la rama con mensaje descriptivo. Muéstrame el diff antes.
```

### B — Bug

```
Rama: claude/fix-<slug>

SÍNTOMA
<qué se observa, no tu teoría de la causa>

REPRODUCCIÓN
1. <paso>
2. <paso>
→ esperado: <X>   obtenido: <Y>

EVIDENCIA
```
<error literal, stack, response body, log — crudo>
```

DÓNDE MIRAR (hipótesis, no certeza)
- <ruta>

RESTRICCIONES
- Arregla la causa, no el síntoma. Si el fix real es grande, dímelo antes.
- No cambies comportamiento no relacionado.

think hard sobre la causa antes de escribir el fix.

HECHO CUANDO
Los pasos de reproducción dan <esperado>.

VERIFICACIÓN
<comando o pasos manuales>

ENTREGA
Un commit. Muéstrame el diff antes de commitear.
```

### C — Auditoría (solo lectura, alta densidad)

```
No modifiques ningún archivo. Esto es solo lectura.

OBJETIVO
Auditar <qué> en <alcance>.

MÉTODO
Usa un subagente para leer los archivos. No traigas su contenido a este
contexto, solo las conclusiones.

ENTREGA
Una tabla:
| archivo | <criterio 1> | <criterio 2> | severidad |

Después, máximo 5 bullets con lo que arreglarías primero y por qué.
Sin recomendaciones genéricas: solo hallazgos concretos con ruta y línea.
```

### D — Refactor

```
Rama: claude/refactor-<slug>

OBJETIVO
<qué mejora estructural, y por qué duele hoy>

INVARIANTE
El comportamiento observable NO cambia. Nada de mejoras de paso.

MÉTODO
1. Describe el comportamiento actual de <X> y cómo lo vas a comprobar.
2. Muéstrame el plan del refactor. Espera OK.
3. Ejecuta en pasos chicos. Verifica después de cada uno.

RESTRICCIONES
- Sin dependencias nuevas.
- Sin renombrar nada público sin avisarme.
- Si encuentras un bug preexistente: anótalo, NO lo arregles aquí.

VERIFICACIÓN
<comando> antes y después: misma salida.

ENTREGA
Un commit por paso.
```

### E — Investigación (sin código)

```
No escribas ni modifiques código. Solo investiga y responde.

PREGUNTA
<pregunta concreta>

DÓNDE
<archivos o áreas>

ultrathink.

ENTREGA
- Respuesta directa en 3-5 frases.
- Evidencia: rutas y números de línea.
- Qué NO pudiste determinar y qué haría falta para saberlo.
```

---

## Ejemplos reales de este repo

**Riesgo alto — AZUL**

```
Rama: claude/azul-idempotencia

Lee CLAUDE.md primero. Esto toca cobros en producción: máxima cautela.

OBJETIVO
supabase/functions/azul-callback debe ser idempotente: si AZUL reenvía el
mismo callback, la orden no debe procesarse dos veces.

CONTEXTO
- supabase/functions/azul-callback/ (léela completa)
- supabase/AZUL_SETUP.md

RESTRICCIONES
- NO toques azul-create-payment. El AuthHash sigue la spec oficial y
  cualquier cambio rompe el cobro.
- No cambies el formato del response a AZUL.
- No commitees nada.

PLAN
Muéstrame: dónde detectas el duplicado, qué guardas, qué pasa en una
carrera de dos callbacks simultáneos. Espera mi OK antes de escribir código.

HECHO CUANDO
Un segundo callback con el mismo id de transacción es un no-op que igual
responde OK a AZUL.

ENTREGA
Diff en el working tree. Sin commit. Lo reviso en sesión aparte.
```

**Riesgo bajo — SEO**

```
Rama: claude/seo-landings

OBJETIVO
Que las 11 landings de la raíz tengan meta description (150-160 chars) y
og:image.

RESTRICCIONES
- Solo el <head>. No toques el <body>.
- Nada de em-dash (—) en title ni description.
- Español, tono comercial dominicano, coherente con el resto del sitio.

MÉTODO
Primero muéstrame una tabla de qué falta en cada archivo. Después de mi OK,
aplícalo.

VERIFICACIÓN
grep -L 'meta name="description"' *.html   → sin resultados

ENTREGA
Un commit.
```

---

## Anti-patrones

| Anti-patrón | Por qué falla |
|---|---|
| Prompt de 3 palabras para tarea de 3 archivos | el agente rellena los huecos adivinando |
| Prompt de 2 páginas para un typo | ruido; el modelo pierde la señal |
| Pedir 4 cosas no relacionadas en un prompt | las hace mal las 4; una hija por tarea |
| Sin criterio de "terminado" | termina cuando *él* cree, no cuando tú necesitas |
| Sin restricciones | expande alcance, toca de más |
| Reutilizar la hija para otra tarea | contexto sucio; `/clear` o sesión nueva |
| Copiar una plantilla sin llenar las anclas | plantilla vacía = prompt vago con formato bonito |

## El comando

Todo esto está automatizado en `/prompt`. Ver `.claude/commands/prompt.md`.

```
/prompt quiero que el carrito guarde el estado en localStorage
```

Devuelve el prompt completo, listo para pegar en una sesión hija.
