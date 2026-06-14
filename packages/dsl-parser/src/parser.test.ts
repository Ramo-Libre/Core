import { describe, it, expect } from 'bun:test';
import {
	parseDSL,
	parseScript,
	buildEvalContext,
	evaluate,
	evaluateExpression,
	extractFreeVariables,
	extractCalculatedVars,
	extractDomains,
	toLatex,
	domainStep,
	clamp,
	statementDisplayName,
	type AssignmentStatement,
	type ConstraintStatement,
} from './parser';

// ============================================================
// HELPERS
// ============================================================

/** Evalúa una expresión DSL con un contexto de variables dado */
function evalExpr(dsl: string, vars: Record<string, number> = {}): number {
	const node = parseDSL(dsl);
	return evaluateExpression(node, [], vars);
}

/** Parsea un script y retorna el contexto evaluado */
function evalScript(script: string, vars: Record<string, number> = {}): Record<string, number> {
	const stmts = parseScript(script);
	return buildEvalContext(stmts, vars);
}

// ============================================================
// SECCIÓN 1: parseDSL — Expresiones aritméticas básicas
// ============================================================

describe('parseDSL — aritmética básica', () => {
	it('parsea un número literal', () => {
		const node = parseDSL('42');
		expect(node).toEqual({ type: 'number', value: 42 });
	});

	it('parsea una variable', () => {
		const node = parseDSL('X');
		expect(node).toEqual({ type: 'variable', name: 'X' });
	});

	it('evalúa suma', () => expect(evalExpr('1 + 2')).toBe(3));
	it('evalúa resta', () => expect(evalExpr('10 - 4')).toBe(6));
	it('evalúa multiplicación', () => expect(evalExpr('3 * 4')).toBe(12));
	it('evalúa división', () => expect(evalExpr('10 / 4')).toBe(2.5));
	it('evalúa potencia', () => expect(evalExpr('2 ** 10')).toBe(1024));

	it('respeta precedencia: * antes que +', () => expect(evalExpr('2 + 3 * 4')).toBe(14));
	it('respeta precedencia: ** antes que *', () => expect(evalExpr('2 * 3 ** 2')).toBe(18));

	it('evalúa paréntesis', () => expect(evalExpr('(2 + 3) * 4')).toBe(20));
	it('evalúa unario negativo', () => expect(evalExpr('-5')).toBe(-5));
	it('evalúa unario negativo en expresión', () => expect(evalExpr('10 + -3')).toBe(7));

	it('evalúa variable del contexto', () => expect(evalExpr('X * 2', { X: 7 })).toBe(14));

	it('potencia es asociativa a la derecha: 2**3**2 = 512', () => {
		// 2**(3**2) = 2**9 = 512
		expect(evalExpr('2 ** 3 ** 2')).toBe(512);
	});

	it('división de flotantes es exacta con Decimal', () => {
		// 0.1 + 0.2 con float nativo JS = 0.30000000000000004
		// con Decimal debe ser exactamente 0.3
		expect(evalExpr('0.1 + 0.2')).toBeCloseTo(0.3, 10);
	});
});

// ============================================================
// SECCIÓN 2: Funciones integradas — prom, cada, escalon
// ============================================================

describe('Funciones — prom()', () => {
	it('promedio de dos valores', () => expect(evalExpr('prom(60, 80)')).toBe(70));
	it('promedio de tres valores', () => expect(evalExpr('prom(50, 60, 70)')).toBe(60));
	it('promedio con variable', () => expect(evalExpr('prom(C1, C2)', { C1: 40, C2: 80 })).toBe(60));
	it('promedio de un solo valor = ese valor', () => expect(evalExpr('prom(77)')).toBe(77));
});

describe('Funciones — cada()', () => {
	it('mínimo de dos valores', () => expect(evalExpr('cada(80, 60)')).toBe(60));
	it('mínimo de tres valores', () => expect(evalExpr('cada(90, 55, 70)')).toBe(55));
	it('cada con variables', () => {
		expect(evalExpr('cada(C1, C2)', { C1: 45, C2: 90 })).toBe(45);
	});
});

describe('Funciones — escalon()', () => {
	it('escalon(1) = 1', () => expect(evalExpr('escalon(1)')).toBe(1));
	it('escalon(0) = 1', () => expect(evalExpr('escalon(0)')).toBe(1));
	it('escalon(-1) = 0', () => expect(evalExpr('escalon(-1)')).toBe(0));
	it('escalon con expresión positiva = 1', () => {
		expect(evalExpr('escalon(X - 55)', { X: 60 })).toBe(1);
	});
	it('escalon con expresión negativa = 0', () => {
		expect(evalExpr('escalon(X - 55)', { X: 40 })).toBe(0);
	});
});

describe('Funciones — min()', () => {
	it('mínimo de dos valores', () => expect(evalExpr('min(80, 60)')).toBe(60));
	it('mínimo de tres valores', () => expect(evalExpr('min(90, 55, 70)')).toBe(55));
	it('mínimo de un valor = ese valor', () => expect(evalExpr('min(42)')).toBe(42));
	it('mínimo con variables', () => {
		expect(evalExpr('min(C1, C2)', { C1: 45, C2: 90 })).toBe(45);
	});
	it('mínimo con expresiones', () => {
		expect(evalExpr('min(C1 * 0.6, C2)', { C1: 100, C2: 50 })).toBe(50);
	});
	it('toLatex → \\min', () => {
		expect(toLatex(parseDSL('min(C1, C2)'))).toBe('\\min\\left(C_{1},\\, C_{2}\\right)');
	});
});

describe('Funciones — max()', () => {
	it('máximo de dos valores', () => expect(evalExpr('max(80, 60)')).toBe(80));
	it('máximo de tres valores', () => expect(evalExpr('max(30, 55, 70)')).toBe(70));
	it('máximo de un valor = ese valor', () => expect(evalExpr('max(42)')).toBe(42));
	it('máximo con variables', () => {
		expect(evalExpr('max(C1, C2)', { C1: 45, C2: 90 })).toBe(90);
	});
	it('máximo con expresiones', () => {
		expect(evalExpr('max(C1 * 0.6, C2)', { C1: 100, C2: 50 })).toBe(60);
	});
	it('toLatex → \\max', () => {
		expect(toLatex(parseDSL('max(C1, C2)'))).toBe('\\max\\left(C_{1},\\, C_{2}\\right)');
	});
	it('max dentro de asignación', () => {
		const ctx = evalScript('NF = max(PC, Cert)', { PC: 65, Cert: 80 });
		expect(ctx['NF']).toBe(80);
	});
});

// ============================================================
// SECCIÓN 3: parseScript — Assignments
// ============================================================

describe('parseScript — assignments', () => {
	it('parsea una asignación simple', () => {
		const stmts = parseScript('PC = prom(C1, C2)');
		expect(stmts).toHaveLength(1);
		expect(stmts[0]!.type).toBe('assignment');
	});

	it('evalúa asignación con variables libres', () => {
		const ctx = evalScript('PC = prom(C1, C2)', { C1: 60, C2: 80 });
		expect(ctx['PC']).toBe(70);
	});

	it('evalúa cadena de asignaciones (dependencias en orden)', () => {
		const script = `
			PC = prom(C1, C2)
			NF = PC * 0.6 + Cert * 0.4
		`;
		const ctx = evalScript(script, { C1: 60, C2: 80, Cert: 75 });
		expect(ctx['PC']).toBe(70);
		// NF = 70*0.6 + 75*0.4 = 42 + 30 = 72
		expect(ctx['NF']).toBeCloseTo(72, 10);
	});

	it('resuelve dependencias fuera de orden (iteración multipass)', () => {
		// NF se define antes que PC, pero depende de él
		const script = `
			NF = PC * 0.6 + Cert * 0.4
			PC = prom(C1, C2)
		`;
		const ctx = evalScript(script, { C1: 60, C2: 80, Cert: 75 });
		expect(ctx['NF']).toBeCloseTo(72, 10);
	});

	it('parsea label en asignación', () => {
		const stmts = parseScript('Promedio de certamenes: PC = prom(C1, C2)');
		const stmt = stmts[0] as AssignmentStatement;
		expect(stmt.label).toBe('Promedio de certamenes');
		expect(stmt.lhs).toBe('PC');
	});

	it('ignora comentarios con //', () => {
		const stmts = parseScript(`
			// esto es un comentario
			PC = prom(C1, C2)
		`);
		expect(stmts).toHaveLength(1);
	});

	it('ignora líneas vacías', () => {
		const stmts = parseScript('\n\n\nPC = prom(C1, C2)\n\n');
		expect(stmts).toHaveLength(1);
	});
});

// ============================================================
// SECCIÓN 4: parseScript — Constraints
// ============================================================

describe('parseScript — constraints', () => {
	it('parsea restricción >=', () => {
		const stmts = parseScript('C1 >= 55');
		expect(stmts[0]!.type).toBe('constraint');
		const c = stmts[0] as ConstraintStatement;
		expect(c.operator).toBe('>=');
	});

	it('evalúa C1 >= 55 cuando C1=60: verdadero', () => {
		const stmts = parseScript('C1 >= 55');
		expect(evaluate(stmts[0]!, stmts, { C1: 60 })).toBe(true);
	});

	it('evalúa C1 >= 55 cuando C1=40: falso', () => {
		const stmts = parseScript('C1 >= 55');
		expect(evaluate(stmts[0]!, stmts, { C1: 40 })).toBe(false);
	});

	it('evalúa <=', () => {
		const stmts = parseScript('C1 <= 100');
		expect(evaluate(stmts[0]!, stmts, { C1: 100 })).toBe(true);
		expect(evaluate(stmts[0]!, stmts, { C1: 101 })).toBe(false);
	});

	it('evalúa <', () => {
		const stmts = parseScript('C1 < 100');
		expect(evaluate(stmts[0]!, stmts, { C1: 99 })).toBe(true);
		expect(evaluate(stmts[0]!, stmts, { C1: 100 })).toBe(false);
	});

	it('evalúa >', () => {
		const stmts = parseScript('C1 > 55');
		expect(evaluate(stmts[0]!, stmts, { C1: 55 })).toBe(false);
		expect(evaluate(stmts[0]!, stmts, { C1: 56 })).toBe(true);
	});

	it('evalúa ==', () => {
		const stmts = parseScript('C1 == 70');
		expect(evaluate(stmts[0]!, stmts, { C1: 70 })).toBe(true);
		expect(evaluate(stmts[0]!, stmts, { C1: 71 })).toBe(false);
	});

	it('restricción sobre variable calculada', () => {
		const script = `
			PC = prom(C1, C2)
			PC >= 55
		`;
		const stmts = parseScript(script);
		const constraint = stmts[1]!;
		expect(evaluate(constraint, stmts, { C1: 50, C2: 60 })).toBe(true);
		expect(evaluate(constraint, stmts, { C1: 30, C2: 60 })).toBe(false);
	});

	it('parsea label en constraint', () => {
		const stmts = parseScript('Aprobacion: C1 >= 55');
		const c = stmts[0] as ConstraintStatement;
		expect(c.label).toBe('Aprobacion');
	});
});
// ============================================================
// SECCIÓN 5: parseScript — Dominios
// ============================================================

describe('parseScript — dominios', () => {
	it('parsea dominio con palabra clave "dominio"', () => {
		const stmts = parseScript('dominio C1, C2 [0, 100]');
		expect(stmts[0]!.type).toBe('domain');
	});

	it('parsea dominio con sintaxis "in"', () => {
		const stmts = parseScript('C1, C2 in [0, 100]');
		expect(stmts[0]!.type).toBe('domain');
	});

	it('extrae variables y rango correctamente', () => {
		const domains = extractDomains(parseScript('dominio C1, C2 [0, 100]'));
		expect(domains['C1']).toEqual({ min: 0, max: 100 });
		expect(domains['C2']).toEqual({ min: 0, max: 100 });
	});

	it('parsea dominio con decimales', () => {
		const domains = extractDomains(parseScript('dominio X [0.0, 1.0]'));
		expect(domains['X']).toEqual({ min: 0.0, max: 1.0 });
	});

	it('parsea dominio con negativos', () => {
		const domains = extractDomains(parseScript('dominio T [-10, 10]'));
		expect(domains['T']).toEqual({ min: -10, max: 10 });
	});
});

// ============================================================
// SECCIÓN 6: Extractores de variables
// ============================================================

describe('extractFreeVariables', () => {
	it('extrae variables libres de una asignación', () => {
		const stmts = parseScript('PC = prom(C1, C2)');
		const free = extractFreeVariables(stmts);
		expect(free).toContain('C1');
		expect(free).toContain('C2');
		expect(free).not.toContain('PC');
	});

	it('no incluye variables calculadas como libres', () => {
		const script = `
			PC = prom(C1, C2)
			NF = PC * 0.6 + Cert * 0.4
		`;
		const stmts = parseScript(script);
		const free = extractFreeVariables(stmts);
		expect(free).toContain('C1');
		expect(free).toContain('C2');
		expect(free).toContain('Cert');
		expect(free).not.toContain('PC');
		expect(free).not.toContain('NF');
	});

	it('extrae variables libres de constraints también', () => {
		const stmts = parseScript('X >= MinVal');
		const free = extractFreeVariables(stmts);
		expect(free).toContain('X');
		expect(free).toContain('MinVal');
	});
});

describe('extractCalculatedVars', () => {
	it('retorna solo los LHS de asignaciones', () => {
		const script = `
			PC = prom(C1, C2)
			NF = PC * 0.6
		`;
		const stmts = parseScript(script);
		const calc = extractCalculatedVars(stmts);
		expect(calc.has('PC')).toBe(true);
		expect(calc.has('NF')).toBe(true);
		expect(calc.has('C1')).toBe(false);
	});
});

// ============================================================
// SECCIÓN 7: buildEvalContext — contexto completo
// ============================================================

describe('buildEvalContext', () => {
	it('incluye las variables libres en el contexto', () => {
		const ctx = evalScript('PC = prom(C1, C2)', { C1: 60, C2: 80 });
		expect(ctx['C1']).toBe(60);
		expect(ctx['C2']).toBe(80);
		expect(ctx['PC']).toBe(70);
	});

	it('caso realista: nota final ponderada', () => {
		const script = `
			PC  = prom(C1, C2)
			NF  = PC * 0.6 + Cert * 0.4
		`;
		const ctx = evalScript(script, { C1: 55, C2: 65, Cert: 80 });
		// PC = 60, NF = 60*0.6 + 80*0.4 = 36 + 32 = 68
		expect(ctx['PC']).toBe(60);
		expect(ctx['NF']).toBeCloseTo(68, 10);
	});
});

// ============================================================
// SECCIÓN 8: toLatex
// ============================================================

describe('toLatex — expresiones', () => {
	it('número literal', () => {
		expect(toLatex(parseDSL('42'))).toBe('42');
	});

	it('variable simple', () => {
		expect(toLatex(parseDSL('X'))).toBe('X');
	});

	it('variable con sufijo numérico → subíndice', () => {
		expect(toLatex(parseDSL('C1'))).toBe('C_{1}');
	});

	it('suma', () => {
		expect(toLatex(parseDSL('A + B'))).toBe('A + B');
	});

	it('multiplicación → \\cdot', () => {
		expect(toLatex(parseDSL('A * B'))).toBe('A \\cdot B');
	});

	it('división → \\dfrac', () => {
		expect(toLatex(parseDSL('A / B'))).toBe('\\dfrac{A}{B}');
	});

	it('potencia → ^{}', () => {
		expect(toLatex(parseDSL('X ** 2'))).toBe('X^{2}');
	});

	it('paréntesis → \\left( \\right)', () => {
		expect(toLatex(parseDSL('(A + B)'))).toBe('\\left(A + B\\right)');
	});

	it('prom() → fracción LaTeX', () => {
		expect(toLatex(parseDSL('prom(C1, C2)'))).toBe('\\dfrac{C_{1} + C_{2}}{2}');
	});

	it('cada() → \\forall', () => {
		expect(toLatex(parseDSL('cada(C1, C2)'))).toBe('\\forall \\left(C_{1},\\, C_{2}\\right)');
	});

	it('escalon() → \\theta', () => {
		expect(toLatex(parseDSL('escalon(X)'))).toBe('\\theta\\left(X\\right)');
	});
});

describe('toLatex — statements', () => {
	it('assignment statement', () => {
		const stmts = parseScript('PC = prom(C1, C2)');
		expect(toLatex(stmts[0]!)).toBe('\\text{PC} = \\dfrac{C_{1} + C_{2}}{2}');
	});

	it('assignment con label', () => {
		const stmts = parseScript('Promedio: PC = prom(C1, C2)');
		expect(toLatex(stmts[0]!)).toContain('\\text{Promedio}');
	});

	it('constraint statement >= → \\geq', () => {
		const stmts = parseScript('C1 >= 55');
		expect(toLatex(stmts[0]!)).toBe('C_{1} \\geq 55');
	});

	it('constraint statement <= → \\leq', () => {
		const stmts = parseScript('C1 <= 100');
		expect(toLatex(stmts[0]!)).toBe('C_{1} \\leq 100');
	});

	it('constraint == → =', () => {
		const stmts = parseScript('X == 70');
		expect(toLatex(stmts[0]!)).toBe('\\text{X} = 70');
	});

	it('domain statement → \\in', () => {
		const stmts = parseScript('dominio C1, C2 [0, 100]');
		const latex = toLatex(stmts[0]!);
		expect(latex).toContain('\\in');
		expect(latex).toContain('[0,');
		expect(latex).toContain('100]');
	});

	it('escapa label con caracteres especiales', () => {
		const stmts = parseScript('Nota_final: NF = PC * 0.6');
		const latex = toLatex(stmts[0]!);
		expect(latex).toContain('\\_');
	});
});

// ============================================================
// SECCIÓN 9: Utilidades
// ============================================================

describe('domainStep', () => {
	it('enteros → paso 1', () => expect(domainStep(0, 100)).toBe(1));
	it('decimales → paso 0.1', () => expect(domainStep(0, 1.5)).toBe(0.1));
	it('mínimo decimal → paso 0.1', () => expect(domainStep(0.5, 10)).toBe(0.1));
});

describe('clamp', () => {
	it('valor dentro del rango', () => expect(clamp(50, 0, 100)).toBe(50));
	it('valor por debajo del mínimo', () => expect(clamp(-5, 0, 100)).toBe(0));
	it('valor por encima del máximo', () => expect(clamp(150, 0, 100)).toBe(100));
	it('exactamente en el mínimo', () => expect(clamp(0, 0, 100)).toBe(0));
	it('exactamente en el máximo', () => expect(clamp(100, 0, 100)).toBe(100));
});

describe('statementDisplayName', () => {
	it('usa label si está presente', () => {
		const stmts = parseScript('Aprobacion: C1 >= 55');
		const stmt = stmts[0] as ConstraintStatement;
		expect(statementDisplayName(stmt)).toBe('Aprobacion');
	});

	it('usa raw si no hay label', () => {
		const stmts = parseScript('C1 >= 55');
		const stmt = stmts[0] as ConstraintStatement;
		expect(statementDisplayName(stmt)).toBe('C1 >= 55');
	});
});

// ============================================================
// SECCIÓN 10: Casos extremos y robustez
// ============================================================

describe('Casos extremos', () => {
	it('script vacío retorna []', () => {
		expect(parseScript('')).toEqual([]);
	});

	it('script con solo comentarios retorna []', () => {
		expect(parseScript('// solo un comentario\n// otro')).toEqual([]);
	});

	it('variable indefinida retorna 0 en evaluateExpression', () => {
		const node = parseDSL('X');
		expect(evaluateExpression(node, [], {})).toBe(0);
	});

	it('línea inválida es ignorada silenciosamente', () => {
		const stmts = parseScript('%%% esto no es DSL %%%\nPC = prom(C1, C2)');
		expect(stmts).toHaveLength(1);
	});

	it('constraint con variable indefinida retorna false', () => {
		const stmts = parseScript('X >= 55');
		expect(evaluate(stmts[0]!, stmts, {})).toBe(false);
	});

	it('parseScript retorna [] si el input es solo espacios', () => {
		expect(parseScript('   \n\n   ')).toEqual([]);
	});

	it('caso realista completo: ramo con PC, Cert, NF y restricciones', () => {
		const script = `
			// Ramo: Cálculo I
			dominio C1, C2 [0, 100]
			dominio Cert [0, 100]
			PC  = prom(C1, C2)
			NF  = PC * 0.6 + Cert * 0.4
			Aprobacion: NF >= 55
			Notas min: cada(C1, C2) >= 30
		`;
		const stmts = parseScript(script);
		const vars = { C1: 60, C2: 70, Cert: 80 };
		const ctx = buildEvalContext(stmts, vars);

		// PC = 65, NF = 65*0.6 + 80*0.4 = 39 + 32 = 71
		expect(ctx['PC']).toBe(65);
		expect(ctx['NF']).toBeCloseTo(71, 10);

		const nfConstraint = stmts.find(
			(s) => s.type === 'constraint' && s.label === 'Aprobacion'
		)!;
		expect(evaluate(nfConstraint, stmts, vars)).toBe(true);
	});
});
