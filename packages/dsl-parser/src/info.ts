// ============================================================
// Descriptor del DSL — estructura para la UI de Sintaxis
// y generación del prompt de contexto IA
// ============================================================

// ============================================================
// TIPOS
// ============================================================

export interface DSLToken {
	/** El símbolo o keyword tal como se escribe en el DSL */
	symbol: string;
	/** Descripción corta para mostrar en la UI */
	label: string;
}

export interface DSLFunction {
	/** Nombre con paréntesis, ej: "prom()" */
	name: string;
	/** Descripción corta */
	label: string;
	/** Descripción extendida para tooltips o el prompt */
	description: string;
	/** Ejemplo de uso */
	example: string;
}

export interface DSLCard {
	/** Título del card en mayúsculas, como aparece en la UI */
	title: string;
	/** Tokens/operadores del card (para cards de operadores) */
	tokens?: DSLToken[];
	/** Funciones del card (para el card de funciones) */
	functions?: DSLFunction[];
	/** Descripción en prosa (para cards explicativos) */
	description?: string;
	/** Ejemplos de línea completa para mostrar al pie del card */
	examples: string[];
}

export interface DSLDescriptor {
	/** Nombre del lenguaje */
	name: string;
	/** Descripción de una línea */
	tagline: string;
	/** Cards agrupados por fila, igual que la UI */
	rows: DSLCard[][];
}

// ============================================================
// DATOS
// ============================================================

export const DSL_DESCRIPTOR: DSLDescriptor = {
	name: 'RamoLibre DSL',
	tagline:
		'Lenguaje de dominio específico para definir reglas de evaluación académica con variables, expresiones, restricciones y dominios.',

	rows: [
		// ── FILA 1 ─────────────────────────────────────────────
		[
			{
				title: 'ARITMÉTICA',
				tokens: [
					{ symbol: '+',  label: 'Suma' },
					{ symbol: '-',  label: 'Resta' },
					{ symbol: '*',  label: 'Multiplicación' },
					{ symbol: '/',  label: 'División' },
					{ symbol: '**', label: 'Potencia' },
				],
				examples: ['NF = PC * 0.6 + Cert ** 2 / 100'],
			},
			{
				title: 'COMPARACIÓN Y ASIGNACIÓN',
				tokens: [
					{ symbol: '>=', label: 'Mayor o igual' },
					{ symbol: '<=', label: 'Menor o igual' },
					{ symbol: '>',  label: 'Mayor que' },
					{ symbol: '<',  label: 'Menor que' },
					{ symbol: '=',  label: 'Asignación' },
				],
				examples: ['PC = prom(C1, C2)'],
			},
			{
				title: 'FUNCIONES',
				functions: [
					{
						name: 'prom()',
						label: 'Promedio aritmético',
						description:
							'Calcula el promedio aritmético de todos sus argumentos. Acepta dos o más valores separados por coma.',
						example: 'PC = prom(C1, C2)',
					},
					{
						name: 'cada()',
						label: 'Todos deben cumplir (Mínimo)',
						description:
							'Retorna el mínimo de sus argumentos. Útil para exigir que TODAS las notas superen un umbral: si cada(C1,C2) >= 55, ambas deben ser >= 55.',
						example: 'cada(L1, L2, L3) >= 20',
					},
					{
						name: 'escalon()',
						label: 'Escalón unitario (1 si >= 0, sino 0)',
						description:
							'Función de Heaviside: retorna 1 si el argumento es >= 0, y 0 en caso contrario. Útil para activar/desactivar términos condicionalmente.',
						example: 'Aprobado = escalon(NF - 55)',
					},
					{
						name: 'min()',
						label: 'Mínimo de los argumentos',
						description:
							'Retorna el valor mínimo entre todos sus argumentos. A diferencia de cada(), se usa en expresiones, no en restricciones.',
						example: 'Base = min(NF, 70)',
					},
					{
						name: 'max()',
						label: 'Máximo de los argumentos',
						description:
							'Retorna el valor máximo entre todos sus argumentos.',
						example: 'Recuperado = max(NF, Examen)',
					},
				],
				examples: [
					'cada(L1, L2, L3) >= 20',
					'Aprobado = escalon(NF - 55)',
				],
			},
		],

		// ── FILA 2 ─────────────────────────────────────────────
		[
			{
				title: 'DOMINIOS (LÍMITES)',
				tokens: [
					{ symbol: 'dominio', label: 'Sintaxis clásica con corchetes' },
					{ symbol: 'in',      label: 'Sintaxis alternativa equivalente' },
				],
				description:
					'Define el rango válido de una o más variables libres. Ambas sintaxis son equivalentes. Los dominios generan sliders en el Playground.',
				examples: [
					'dominio C1, C2 [0, 100]',
					'C1, C2 in [1.0, 7.0]',
				],
			},
			{
				title: 'ETIQUETAS (LABELS)',
				description:
					'Asigna un nombre legible a cualquier regla usando "Nombre:" antes de la expresión. La etiqueta aparece en la UI y en el panel de estado.',
				examples: [
					'Nota Final: NF = PC * 0.6',
					'Mínimo Labs: cada(L1, L2) >= 20',
				],
			},
			{
				title: 'VARIABLES CULTIVADAS / CALCULADAS',
				description:
					'Una variable definida con = se convierte en un nodo calculado. No genera slider — su valor se resuelve automáticamente a partir de las variables libres.',
				examples: [
					'PC = prom(C1, C2)',
					'NF = PC * 0.6 + Cert * 0.4',
				],
			},
		],
	],
};

// ============================================================
// PROMPT DE CONTEXTO IA
// ============================================================

/**
 * Genera el prompt de sistema que se copia con el botón "Copiar Contexto IA".
 * Describe completamente el DSL para que un LLM pueda generar scripts válidos.
 */
export function buildAIContextPrompt(): string {
	return `\
Eres un asistente experto en el DSL de RamoLibre, un lenguaje de dominio específico para modelar reglas de evaluación académica.

## Qué puede hacer el DSL

El DSL permite definir:
1. **Variables libres** con dominios (generan sliders interactivos).
2. **Variables calculadas** (asignaciones que se resuelven automáticamente).
3. **Restricciones** (condiciones booleanas que deben cumplirse para aprobar).
4. **Etiquetas** opcionales para hacer las reglas más legibles.

---

## Sintaxis completa

### Aritmética
Los operadores aritméticos disponibles son: + - * / **
La precedencia es estándar: ** > * / > + -
Los paréntesis pueden usarse libremente: NF = (PC + Cert) / 2

### Asignación (variable calculada)
\`NombreVariable = expresión\`
- El lado izquierdo es siempre un identificador simple.
- El lado derecho puede ser cualquier expresión.
- Las variables calculadas NO generan slider.
- Las dependencias se resuelven automáticamente aunque estén desordenadas.

Ejemplos:
  PC = prom(C1, C2)
  NF = PC * 0.6 + Cert * 0.4
  Bonus = escalon(NF - 55) * 5

### Restricciones (constraints)
\`expresión OPERADOR expresión\`
Operadores: >= <= > < ==
Las restricciones evalúan a verdadero o falso.

Ejemplos:
  NF >= 55
  cada(C1, C2) >= 30
  prom(L1, L2, L3) > 20

### Dominios (variables libres)
\`dominio Var1, Var2 [min, max]\`
\`Var1, Var2 in [min, max]\`
Ambas formas son equivalentes. Generan sliders en el Playground.

Ejemplos:
  dominio C1, C2 [0, 100]
  C1, C2 in [1.0, 7.0]

### Etiquetas
\`Nombre legible: expresión\`
Se pueden aplicar a asignaciones, restricciones y dominios.

Ejemplos:
  Nota Final: NF = PC * 0.6 + Cert * 0.4
  Aprobación: NF >= 55
  Mínimo Labs: cada(L1, L2, L3) >= 20

### Comentarios
Las líneas que comienzan con // son ignoradas.

---

## Funciones disponibles

| Función       | Descripción                                                    | Ejemplo                        |
|---------------|----------------------------------------------------------------|--------------------------------|
| prom(a, b, …) | Promedio aritmético de todos los argumentos                    | PC = prom(C1, C2)              |
| cada(a, b, …) | Mínimo de los argumentos — exige que TODOS superen un umbral   | cada(C1, C2) >= 55             |
| min(a, b, …)  | Mínimo de los argumentos (para usar en expresiones)            | Base = min(NF, 70)             |
| max(a, b, …)  | Máximo de los argumentos                                       | R = max(NF, Examen)            |
| escalon(x)    | 1 si x >= 0, 0 si x < 0 (función de Heaviside)                | Aprobado = escalon(NF - 55)    |

---

## Reglas importantes

- Las **variables libres** son cualquier identificador que aparece en una expresión pero nunca en el LHS de una asignación. Deben tener dominio definido para aparecer como slider.
- El DSL es **case-sensitive**: C1 y c1 son variables distintas.
- Las líneas vacías y los comentarios (//) se ignoran.
- Las dependencias circulares no están soportadas.
- Los números soportan decimales: 0.6, 1.5, 100.0
- **No usar ==** en restricciones a menos que se necesite igualdad exacta; preferir >= o <=.

---

## Ejemplo completo — Ramo típico

\`\`\`
// Dominio de variables libres
dominio C1, C2 [0, 100]
dominio Cert [0, 100]
dominio Labs [0, 100]

// Variables calculadas
PC   = prom(C1, C2)
NF   = PC * 0.6 + Cert * 0.3 + Labs * 0.1

// Restricciones de aprobación
Aprobación nota final: NF >= 55
Mínimo certámenes: cada(C1, C2) >= 30
Mínimo laboratorios: Labs >= 40
\`\`\`

---

Cuando el usuario te pida generar un script DSL, responde ÚNICAMENTE con el bloque de código DSL, sin explicaciones adicionales a menos que el usuario las pida explícitamente. Usa etiquetas descriptivas en español para las restricciones. Define siempre los dominios al inicio.
`;
}
