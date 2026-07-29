import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { retrieveComplianceContext } from '../rag/knowledgeBase.js';

/**
 * complianceRagTool.js
 *
 * Gives the orchestrator agent access to the local compliance/regulatory
 * knowledge base (NNN agreements, restricted-goods shipping rules, customs
 * classification basics). This is what keeps the agent from hallucinating
 * regulatory specifics — it must retrieve and cite an actual document
 * excerpt rather than answering compliance questions from parametric memory.
 */
export const complianceRagTool = tool(
  async (input) => {
    try {
      const results = await retrieveComplianceContext(input.query, input.topK ?? 3);

      if (results.length === 0) {
        return JSON.stringify({
          ok: true,
          found: false,
          message: 'No relevant compliance documents found for this query.',
        });
      }

      return JSON.stringify({ ok: true, found: true, excerpts: results });
    } catch (err) {
      return JSON.stringify({ ok: false, error: err.message });
    }
  },
  {
    name: 'search_compliance_docs',
    description:
      'Searches the local compliance/regulatory knowledge base (NNN agreements, restricted-goods ' +
      'shipping rules such as lithium-ion batteries and medical device components, and customs ' +
      'classification/HS code basics) for passages relevant to a query. Use this whenever the user asks ' +
      'about legal/regulatory requirements, IP protection agreements, or shipping restrictions — do not ' +
      'answer these questions from memory.',
    schema: z.object({
      query: z.string().min(1).describe('The compliance/regulatory question to search for'),
      topK: z
        .number()
        .int()
        .positive()
        .max(10)
        .optional()
        .describe('How many passages to retrieve (default 3)'),
    }),
  }
);
