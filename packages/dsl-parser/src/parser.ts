// ============================================================
// Motor de Parsing DSL para el sistema de reglas académicas
// Recursive Descent Parser — usa decimal.js para aritmética exacta
// ============================================================

import Decimal from 'decimal.js';

// Configuración global: 20 dígitos significativos, redondeo HALF_UP
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ============================================================
// SECCIÓN 1: DEFINICIÓN DEL AST
// ============================================================

/** Nodo hoja: número literal */
export type NumberNode = { type: 'number'; value: number };

/** Nodo hoja: referencia a variable (libre o calculada) */
export type VariableNode = { type: 'variable'; name: string };

/** Nodo de operación binaria: left OP right */
export type BinaryNode = {
	type: 'binary';
	operator: '+' | '-' | '*' | '/' | '**';
	left: ASTNode;
	right: ASTNode;
};

/** Nodo de agrupación explícita con paréntesis — preservado para LaTeX */
export type ParensNode = { type: 'parens'; expression: ASTNode };

/**
 * Nodo de función. Actualmente soportadas: prom(), cada(), escalon().
 * Para extender: agrega el nombre aquí y maneja la evaluación en `evaluateAST()`.
 */
export type FunctionNode = {
	type: 'function';
	name: string;
	args: ASTNode[];
};

/** Unión de todos los nodos de expresión matemática */
export type ASTNode = NumberNode | VariableNode | BinaryNode | ParensNode | FunctionNode;

// — Statements (declaraciones de línea completa) —

/**
 * Asignación: `PC = prom(C1, C2)` o `NF = PC * 0.6 + Cert * 0.4`
 */
export interface AssignmentStatement {
	type: 'assignment';
	lhs: string;
	expression: ASTNode;
	raw: string;
	label?: string;
}

/**
 * Restricción / Inecuación: `C1 >= 55`, `prom(C1,C2) <= 70`
 * Soporta: >=, <=, >, <, ==
 */
export interface ConstraintStatement {
	type: 'constraint';
	left: ASTNode;
	operator: '>=' | '<=' | '>' | '<' | '==';
	right: ASTNode;
	raw: string;
	label?: string;
}

/**
 * Dominio de variable: `dominio C1, C2 [0, 100]` o `C1, C2 in [0, 100]`
 */
export interface DomainStatement {
	type: 'domain';
	variables: string[];
	min: number;
	max: number;
	raw: string;
	label?: string;
}

export type StatementNode = AssignmentStatement | ConstraintStatement | DomainStatement;

// ============================================================
// SECCIÓN 2: TOKENIZADOR (Lexer)
// ============================================================

type TokenType = 'number' | 'id' | 'op' | 'comma' | 'lparen' | 'rparen' | 'colon' | 'eof';

interface Token {
	type: TokenType;
	value: string;
}

const EOF_TOKEN: Token = { type: 'eof', value: '' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const normalized = input.replace(/\s+/g, ' ').trim();

  const tokenRegex =
    /(\d+(?:\.\d+)?)|(\*\*|>=|<=|==|>|<|[+\-*/])|([A-Za-z_]\w*)|(,)|(\()|(\))|(:)/g;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(normalized)) !== null) {
    const [, num, op, id, comma, lparen, rparen, colon] = match;
    if (num !== undefined)     tokens.push({ type: 'number', value: num });
    else if (op !== undefined)     tokens.push({ type: 'op', value: op });
    else if (id !== undefined)     tokens.push({ type: 'id', value: id });
    else if (comma !== undefined)  tokens.push({ type: 'comma', value: ',' });
    else if (lparen !== undefined) tokens.push({ type: 'lparen', value: '(' });
    else if (rparen !== undefined) tokens.push({ type: 'rparen', value: ')' });
    else if (colon !== undefined)  tokens.push({ type: 'colon', value: ':' });
  }
  tokens.push(EOF_TOKEN);
  return tokens;
}

// ============================================================
// SECCIÓN 3: PARSER MATEMÁTICO (Recursive Descent)
// ============================================================

function createExpressionParser(tokens: Token[]) {
	let pos = 0;

	const peek = (): Token => tokens[pos] ?? EOF_TOKEN;
	const consume = (): Token => tokens[pos++] ?? EOF_TOKEN;

	const expectOp = (value: string): Token => {
		const t = tokens[pos];
		if (!t || t.value !== value) {
			throw new Error(`Se esperaba '${value}', se encontró '${t?.value ?? 'EOF'}'`);
		}
		return tokens[pos++]!;
	};

	function parsePrimary(): ASTNode {
		const t = peek();

		if (t.type === 'number') {
			consume();
			return { type: 'number', value: parseFloat(t.value) };
		}

		if (t.type === 'id') {
			const name = consume().value;
			if (peek().type === 'lparen') {
				consume();
				const args: ASTNode[] = [];
				if (peek().type !== 'rparen') {
					args.push(parseExpr());
					while (peek().type === 'comma') {
						consume();
						args.push(parseExpr());
					}
				}
				expectOp(')');
				return { type: 'function', name, args };
			}
			return { type: 'variable', name };
		}

		if (t.type === 'lparen') {
			consume();
			const expr = parseExpr();
			expectOp(')');
			return { type: 'parens', expression: expr };
		}

		throw new Error(`Token inesperado: '${t.value}'`);
	}

	function parseUnary(): ASTNode {
		if (peek().type === 'op' && peek().value === '-') {
			consume();
			const operand = parsePrimary();
			return { type: 'binary', operator: '-', left: { type: 'number', value: 0 }, right: operand };
		}
		return parsePrimary();
	}

	function parsePower(): ASTNode {
		const left = parseUnary();
		if (peek().type === 'op' && peek().value === '**') {
			consume();
			const right = parsePower();
			return { type: 'binary', operator: '**', left, right };
		}
		return left;
	}

	function parseMulDiv(): ASTNode {
		let left = parsePower();
		while (peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
			const op = consume().value as '*' | '/';
			const right = parsePower();
			left = { type: 'binary', operator: op, left, right };
		}
		return left;
	}

	function parseAddSub(): ASTNode {
		let left = parseMulDiv();
		while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
			const op = consume().value as '+' | '-';
			const right = parseMulDiv();
			left = { type: 'binary', operator: op, left, right };
		}
		return left;
	}

	function parseExpr(): ASTNode {
		return parseAddSub();
	}

	return { parseExpr, peek };
}

export function parseDSL(input: string): ASTNode {
	const tokens = tokenize(input);
	const { parseExpr } = createExpressionParser(tokens);
	return parseExpr();
}

// ============================================================
// SECCIÓN 4: PARSER DE DECLARACIONES (Statement Parser)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RELATIONAL_OPS = ['>=', '<=', '>', '<', '=='] as const;
type RelationalOp = (typeof RELATIONAL_OPS)[number];

function splitOnRelational(line: string): [string, RelationalOp, string] | null {
    const match = line.match(/^([^<>=]+?\S)\s*(>=|<=|==|>|<)\s*(\S.*)$/);
    if (match) {
		const left = match[1];
		const right = match[3];
		if (!left || !right) return null;
		return [left.trim(), match[2] as RelationalOp, right.trim()];
	}
	return null;
}

function extractLabel(line: string): [string | undefined, string] {
	const colonIdx = line.indexOf(':');
	if (colonIdx !== -1) {
		const afterColon = line[colonIdx + 1];
		if (afterColon !== ':') {
			const possibleLabel = line.slice(0, colonIdx).trim();
			const rest = line.slice(colonIdx + 1).trim();
			if (possibleLabel && !/[=<>+\-*/()[\]]/.test(possibleLabel)) {
				return [possibleLabel, rest];
			}
		}
	}
	return [undefined, line];
}

export function parseScript(script: string): StatementNode[] {
	if (!script?.trim()) return [];

	const lines = script
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && !l.startsWith('//'));

	const statements: StatementNode[] = [];

	for (const originalLine of lines) {
		try {
			const stmt = parseLine(originalLine);
			if (stmt) statements.push(stmt);
		} catch {
			// Línea inválida → ignorada silenciosamente
		}
	}

	return statements;
}

function parseLine(line: string): StatementNode | null {
	const [label, rest] = extractLabel(line);

	if (/^dominio\b/i.test(rest)) {
		return parseDomainStatement(rest, label);
	}

	if (/\bin\s*\[/.test(rest)) {
		return parseDomainInStatement(rest, label);
	}

    const assignMatch = rest.match(/^([A-Za-z_]\w*)\s*=\s*(\S[\s\S]*)$/);
    if (assignMatch) {
		const lhs = assignMatch[1]!.trim();
		const rhs = assignMatch[2]!.trim();
		const isAssignment = !splitOnRelational(rhs);
		if (isAssignment) {
			return {
				type: 'assignment',
				lhs,
				expression: parseDSL(rhs),
				raw: line,
				label
			} satisfies AssignmentStatement;
		}
	}

	const parts = splitOnRelational(rest);
	if (parts) {
		const [leftStr, op, rightStr] = parts;
		return {
			type: 'constraint',
			left: parseDSL(leftStr),
			operator: op,
			right: parseDSL(rightStr),
			raw: line,
			label
		} satisfies ConstraintStatement;
	}

	return null;
}

function parseDomainStatement(line: string, label?: string): DomainStatement {
    const match = line.match(
      /^dominio\s+([A-Za-z_]\w*(?:\s*,\s*\w+)*)\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]$/i
    );
    if (!match) throw new Error(`Sintaxis de dominio inválida: ${line}`);
  const variables = match[1]!.split(',').map((v) => v.trim());
  return { type: 'domain', variables, min: parseFloat(match[2]!), max: parseFloat(match[3]!), raw: line, label };
}

function parseDomainInStatement(line: string, label?: string): DomainStatement {
    const match = line.match(
      /^([A-Za-z_]\w*(?:\s*,\s*\w+)*)\s+in\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]$/i
    );
    if (!match) throw new Error(`Sintaxis 'in' de dominio inválida: ${line}`);
  const variables = match[1]!.split(',').map((v) => v.trim());
  return { type: 'domain', variables, min: parseFloat(match[2]!), max: parseFloat(match[3]!), raw: line, label };
}

// ============================================================
// SECCIÓN 5: EVALUADOR — opera internamente con Decimal
// ============================================================

/**
 * Evalúa un ASTNode usando aritmética Decimal de precisión arbitraria.
 * Retorna un Decimal para evitar conversiones intermedias a float.
 */
function evaluateASTDecimal(node: ASTNode, context: Record<string, Decimal>): Decimal {
	switch (node.type) {
		case 'number':
			return new Decimal(node.value.toString());

		case 'variable': {
			const val = context[node.name];
			if (val === undefined) {
				throw new Error(`Variable no definida: "${node.name}"`);
			}
			return val;
		}

		case 'parens':
			return evaluateASTDecimal(node.expression, context);

		case 'binary': {
			const l = evaluateASTDecimal(node.left, context);
			const r = evaluateASTDecimal(node.right, context);

			switch (node.operator) {
				case '+':
					return l.plus(r);
				case '-':
					return l.minus(r);
				case '*':
					return l.times(r);
				case '/':
					if (r.isZero()) {
						throw new Error('División por cero');
					}
					return l.dividedBy(r);
				case '**':
					return l.pow(r);
			}
			break;
		}

		case 'function': {
			const args = node.args.map((a) => evaluateASTDecimal(a, context));

			switch (node.name) {
				case 'prom': {
					if (args.length === 0) throw new Error('prom() requiere al menos un argumento');
					return Decimal.sum(...args).dividedBy(args.length);
				}

				case 'cada': {
					if (args.length === 0) throw new Error('cada() requiere al menos un argumento');
					return Decimal.min(...args);
				}

				case 'escalon': {
					if (args.length === 0) throw new Error('escalon() requiere un argumento');
					const arg = args[0]!;
					return arg.greaterThanOrEqualTo(0) ? new Decimal(1) : new Decimal(0);
				}

				case 'min': {
					if (args.length === 0) throw new Error('min() requiere al menos un argumento');
					return Decimal.min(...args);
				}

				case 'max': {
					if (args.length === 0) throw new Error('max() requiere al menos un argumento');
					return Decimal.max(...args);
				}

				default:
					throw new Error(`Función no implementada: "${node.name}"`);
			}
		}
	}
	throw new Error('Nodo AST desconocido');
}

/**
 * Construye un contexto Decimal resolviendo las variables calculadas.
 */
function buildDecimalContext(
	statements: StatementNode[],
	freeVariables: Record<string, number>
): Record<string, Decimal> {
	const context: Record<string, Decimal> = {};
	for (const [name, value] of Object.entries(freeVariables)) {
		context[name] = new Decimal(value.toString());
	}

	const assignments = statements.filter((s): s is AssignmentStatement => s.type === 'assignment');

	const MAX_PASSES = 10;
	for (let pass = 0; pass < MAX_PASSES; pass++) {
		let changed = false;
		for (const stmt of assignments) {
			try {
				const newVal = evaluateASTDecimal(stmt.expression, context);
				const prev = context[stmt.lhs];
				if (!prev || !prev.equals(newVal)) {
					context[stmt.lhs] = newVal;
					changed = true;
				}
			} catch {
				// Variable aún no definida en este pase — se resuelve en el próximo
			}
		}
		if (!changed) break;
	}

	return context;
}

/**
 * Construye el contexto de evaluación y devuelve valores como number JS.
 */
export function buildEvalContext(
	statements: StatementNode[],
	freeVariables: Record<string, number>
): Record<string, number> {
	const decimalCtx = buildDecimalContext(statements, freeVariables);
	const result: Record<string, number> = {};
	for (const [name, dec] of Object.entries(decimalCtx)) {
		result[name] = dec.toNumber();
	}
	return result;
}

/**
 * Evalúa un Statement completo y devuelve number | boolean.
 */
export function evaluate(
	stmt: StatementNode,
	statements: StatementNode[],
	freeVariables: Record<string, number>
): number | boolean {
	const context = buildDecimalContext(statements, freeVariables);

	switch (stmt.type) {
		case 'assignment':
			try {
				return evaluateASTDecimal(stmt.expression, context).toNumber();
			} catch {
				return 0;
			}

		case 'constraint': {
			try {
				const l = evaluateASTDecimal(stmt.left, context);
				const r = evaluateASTDecimal(stmt.right, context);
				switch (stmt.operator) {
					case '>=':
						return l.greaterThanOrEqualTo(r);
					case '<=':
						return l.lessThanOrEqualTo(r);
					case '>':
						return l.greaterThan(r);
					case '<':
						return l.lessThan(r);
					case '==':
						return l.equals(r);
				}
			} catch {
				return false;
			}
			break;
		}

		case 'domain':
			return true;
	}

	return false;
}

/** Evalúa la expresión de un nodo dado el contexto completo. */
export function evaluateExpression(
	node: ASTNode,
	statements: StatementNode[],
	freeVariables: Record<string, number>
): number {
	const context = buildDecimalContext(statements, freeVariables);
	try {
		return evaluateASTDecimal(node, context).toNumber();
	} catch {
		return 0;
	}
}

// ============================================================
// SECCIÓN 6: EXTRACTORES DE INFORMACIÓN
// ============================================================

export function extractCalculatedVars(statements: StatementNode[]): Set<string> {
	return new Set(
		statements.filter((s): s is AssignmentStatement => s.type === 'assignment').map((s) => s.lhs)
	);
}

export function extractFreeVariables(statements: StatementNode[]): string[] {
	const calculatedVars = extractCalculatedVars(statements);
	const allVars = new Set<string>();

	function collectFromAST(node: ASTNode) {
		switch (node.type) {
			case 'variable':
				allVars.add(node.name);
				break;
			case 'parens':
				collectFromAST(node.expression);
				break;
			case 'binary':
				collectFromAST(node.left);
				collectFromAST(node.right);
				break;
			case 'function':
				node.args.forEach(collectFromAST);
				break;
		}
	}

	for (const stmt of statements) {
		if (stmt.type === 'assignment') {
			collectFromAST(stmt.expression);
		} else if (stmt.type === 'constraint') {
			collectFromAST(stmt.left);
			collectFromAST(stmt.right);
		}
	}

	return Array.from(allVars).filter((v) => !calculatedVars.has(v));
}

/** Mantiene compatibilidad con código existente */
export function extractVariables(statements: StatementNode[]): string[] {
	return extractFreeVariables(statements);
}

export function extractDomains(
	statements: StatementNode[]
): Record<string, { min: number; max: number }> {
	const mapa: Record<string, { min: number; max: number }> = {};
	for (const stmt of statements) {
		if (stmt.type === 'domain') {
			for (const v of stmt.variables) {
				mapa[v] = { min: stmt.min, max: stmt.max };
			}
		}
	}
	return mapa;
}

// ============================================================
// SECCIÓN 7: GENERADOR DE LaTeX
// ============================================================

function escapeLatexText(text: string): string {
  return text.replace(/[\\{}^_&%$#~]/g, (char) => {
    const map: Record<string, string> = {
      '\\': '\\textbackslash{}',
      '{': '\\{',
      '}': '\\}',
      '^': '\\^{}',
      '_': '\\_',
      '&': '\\&',
      '%': '\\%',
      '$': '\\$',
      '#': '\\#',
      '~': '\\textasciitilde{}',
    };
    return map[char] ?? char;
  });
}

export function toLatex(node: ASTNode | StatementNode): string {
	if ('raw' in node) {
		if (node.type === 'assignment') {
			const label = node.label ? `\\text{${escapeLatexText(node.label)}}: \\;` : '';
			return `${label}\\text{${node.lhs}} = ${toLatex(node.expression)}`;
		}
		if (node.type === 'constraint') {
			const label = node.label ? `\\text{${escapeLatexText(node.label)}}: \\;` : '';
			const l = toLatex(node.left);
			const r = toLatex(node.right);
			const opMap: Record<string, string> = {
				'>=': '\\geq',
				'<=': '\\leq',
				'>': '>',
				'<': '<',
				'==': '='
			};
			return `${label}${l} ${opMap[node.operator]} ${r}`;
		}
		if (node.type === 'domain') {
			const domLabel = node.label ? `\\text{${escapeLatexText(node.label)}}: \\;` : '';
			return `${domLabel}\\text{${node.variables.join(',\\, ')}} \\in [${node.min},\\, ${node.max}]`;
		}
	}

	const ast = node as ASTNode;
	switch (ast.type) {
		case 'number':
			return ast.value.toString();

		case 'variable':
			return ast.name.replace(/^([A-Za-z_]+)(\d+)$/, '$1_{$2}');

		case 'parens':
			return `\\left(${toLatex(ast.expression)}\\right)`;

		case 'binary': {
			const l = toLatex(ast.left);
			const r = toLatex(ast.right);
			if (ast.operator === '*') return `${l} \\cdot ${r}`;
			if (ast.operator === '/') {
				const cleanL = ast.left.type === 'parens' ? toLatex(ast.left.expression) : l;
				const cleanR = ast.right.type === 'parens' ? toLatex(ast.right.expression) : r;
				return `\\dfrac{${cleanL}}{${cleanR}}`;
			}
			if (ast.operator === '**') {
				const baseLatex =
					ast.left.type === 'parens' ? `\\left(${toLatex(ast.left.expression)}\\right)` : l;
				const exponenteLatex = ast.right.type === 'parens' ? toLatex(ast.right.expression) : r;
				return `${baseLatex}^{${exponenteLatex}}`;
			}
			return `${l} ${ast.operator} ${r}`;
		}

		case 'function': {
			if (ast.name === 'prom') {
				const sum = ast.args.map(toLatex).join(' + ');
				return `\\dfrac{${sum}}{${ast.args.length}}`;
			}
			if (ast.name === 'cada') {
				return `\\forall \\left(${ast.args.map(toLatex).join(',\\, ')}\\right)`;
			}
			if (ast.name === 'escalon') {
				if (!ast.args[0]) throw new Error('escalon() sin argumento en toLatex');
				return `\\theta\\left(${toLatex(ast.args[0])}\\right)`;
			}
			if (ast.name === 'min') {
				return `\\min\\left(${ast.args.map(toLatex).join(',\\, ')}\\right)`;
			}
			if (ast.name === 'max') {
				return `\\max\\left(${ast.args.map(toLatex).join(',\\, ')}\\right)`;
			}
			return `\\operatorname{${ast.name}}\\left(${ast.args.map(toLatex).join(',\\, ')}\\right)`;
		}
	}
	return '';
}

// ============================================================
// SECCIÓN 8: UTILIDADES
// ============================================================

export function domainStep(min: number, max: number): number {
	const hasDecimals = !Number.isInteger(min) || !Number.isInteger(max);
	return hasDecimals ? 0.1 : 1;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function statementDisplayName(stmt: AssignmentStatement | ConstraintStatement): string {
	return stmt.label ?? stmt.raw;
}
