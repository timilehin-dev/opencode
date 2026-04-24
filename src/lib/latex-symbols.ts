/**
 * Converts LaTeX math notation to Unicode equivalents.
 * Handles patterns like $\rightarrow$, $\alpha$, etc.
 * Used by DOCX and PDF tools to clean LLM output.
 */

const LATEX_SYMBOLS: Record<string, string> = {
  // Arrows
  '\\rightarrow': '→', '\\leftarrow': '←', '\\Rightarrow': '⇒', '\\Leftarrow': '⇐',
  '\\leftrightarrow': '↔', '\\Leftrightarrow': '⇔', '\\uparrow': '↑', '\\downarrow': '↓',
  '\\mapsto': '↦', '\\hookrightarrow': '↪', '\\nearrow': '↗', '\\searrow': '↘',
  '\\longrightarrow': '――→', '\\Longrightarrow': '――⇒',

  // Greek letters (lowercase)
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε',
  '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\vartheta': 'ϑ',
  '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν',
  '\\xi': 'ξ', '\\pi': 'π', '\\varpi': 'ϖ', '\\rho': 'ρ', '\\sigma': 'σ',
  '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'φ', '\\varphi': 'φ', '\\chi': 'χ',
  '\\psi': 'ψ', '\\omega': 'ω',

  // Greek letters (uppercase)
  '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ', '\\Xi': 'Ξ',
  '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',

  // Math operators
  '\\times': '×', '\\div': '÷', '\\pm': '±', '\\mp': '∓', '\\cdot': '·',
  '\\ast': '∗', '\\star': '★', '\\circ': '∘', '\\bullet': '•', '\\oplus': '⊕',
  '\\otimes': '⊗', '\\cap': '∩', '\\cup': '∪', '\\in': '∈', '\\notin': '∉',
  '\\subset': '⊂', '\\supset': '⊃', '\\subseteq': '⊆', '\\supseteq': '⊇',
  '\\equiv': '≡', '\\approx': '≈', '\\neq': '≠', '\\leq': '≤', '\\geq': '≥',
  '\\ll': '≪', '\\gg': '≫', '\\propto': '∝', '\\sim': '∼', '\\simeq': '≃',
  '\\cong': '≅', '\\perp': '⊥', '\\angle': '∠', '\\parallel': '∥',
  '\\nabla': '∇', '\\partial': '∂', '\\infty': '∞', '\\emptyset': '∅',
  '\\forall': '∀', '\\exists': '∃', '\\nexists': '∄', '\\neg': '¬',
  '\\wedge': '∧', '\\vee': '∨', '\\vdash': '⊢', '\\models': '⊨',

  // Sets and structures
  '\\mathbb{R}': 'ℝ', '\\mathbb{N}': 'ℕ', '\\mathbb{Z}': 'ℤ', '\\mathbb{Q}': 'ℚ',
  '\\mathbb{C}': 'ℂ', '\\mathbb{F}': '𝔽',
  '\\mathcal{L}': 'ℒ', '\\mathcal{F}': 'ℱ', '\\mathcal{O}': '𝒪', '\\mathcal{P}': '𝒫',

  // Superscripts and subscripts
  '\\sum': '∑', '\\prod': '∏', '\\int': '∫', '\\iint': '∬', '\\oint': '∮',
  '\\bigcup': '⋃', '\\bigcap': '⋂',

  // Other symbols
  '\\ldots': '...', '\\cdots': '⋯', '\\vdots': '⋮', '\\ddots': '⋱',
  '\\hline': '―', '\\sqrt': '√', '\\checkmark': '✓', '\\crossmark': '✗',
  '\\degree': '°', '\\copyright': '©', '\\ trademark': '™',
  '\\textdegree': '°', '\\texttrademark': '™', '\\textcopyright': '©',

  // Spacing
  '\\quad': '  ', '\\qquad': '    ', '\\,': ' ', '\\;': ' ', '\\:': ' ',
};

/**
 * Convert LaTeX math notation in text to Unicode equivalents.
 * Handles both $..$ inline math and bare \command sequences.
 */
export function convertLatexToUnicode(text: string): string {
  let result = text;

  // Handle $...$ inline math (single dollar signs)
  result = result.replace(/\$([^$]+)\$/g, (_match, inner: string) => {
    return convertLatexCommand(inner.trim());
  });

  // Handle bare LaTeX commands outside of $ signs (e.g., \rightarrow without $)
  result = convertLatexCommand(result);

  return result;
}

function convertLatexCommand(text: string): string {
  let result = text;

  // Process multi-char commands first (longer matches first to avoid partial matches)
  const sortedKeys = Object.keys(LATEX_SYMBOLS).sort((a, b) => b.length - a.length);
  for (const cmd of sortedKeys) {
    // Escape backslashes for regex
    const escaped = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), LATEX_SYMBOLS[cmd]);
  }

  // Handle ^{text} superscript notation — convert to simple Unicode superscript
  result = result.replace(/\^{?([^{}^]+)}?/g, (_match, content: string) => {
    const superMap: Record<string, string> = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
      '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      'n': 'ⁿ', 'i': 'ⁱ', '+': '⁺', '-': '⁻', '=': '⁼',
      '(': '⁽', ')': '⁾',
    };
    return content.split('').map(c => superMap[c] || c).join('');
  });

  // Handle _{text} subscript notation
  result = result.replace(/_{?([^{}_]+)}?/g, (_match, content: string) => {
    const subMap: Record<string, string> = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
      '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      'n': 'ₙ', 'i': 'ᵢ', '+': '₊', '-': '₋', '=': '₌',
    };
    return content.split('').map(c => subMap[c] || c).join('');
  });

  // Clean up any remaining bare $ signs
  result = result.replace(/\$/g, '');

  // Clean up any remaining bare backslashes (but not escaped ones)
  // Only remove \ if followed by a space or end of string (likely leftover)
  result = result.replace(/\\(?=[\s,;.)]|\\$/g, '');

  return result;
}
