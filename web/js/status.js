/**
 * CYBR VIEW — estados de revisión y máquina de estados (FASE 7).
 *
 * Flujo normal:
 *   DRAFT → SENT_FOR_REVIEW → CHANGES_REQUESTED → SENT_FOR_REVIEW → APPROVED → ARCHIVED
 *
 * Transiciones permitidas (sin saltos absurdos):
 *   DRAFT            -> SENT_FOR_REVIEW | ARCHIVED
 *   SENT_FOR_REVIEW  -> CHANGES_REQUESTED | APPROVED
 *   CHANGES_REQUESTED-> SENT_FOR_REVIEW
 *   APPROVED         -> ARCHIVED
 *   ARCHIVED         -> (terminal)
 */

export const REVIEW_STATUS = ['DRAFT', 'SENT_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED'];

export const REVIEW_TRANSITIONS = {
  DRAFT: ['SENT_FOR_REVIEW', 'ARCHIVED'],
  SENT_FOR_REVIEW: ['CHANGES_REQUESTED', 'APPROVED'],
  CHANGES_REQUESTED: ['SENT_FOR_REVIEW'],
  APPROVED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransition(from, to) {
  return (REVIEW_TRANSITIONS[from] || []).includes(to);
}
