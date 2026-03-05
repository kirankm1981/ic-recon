import { db } from "./db";
import { reconciliationRules } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDefaultRules() {
  const existing = await db.select().from(reconciliationRules);
  if (existing.length > 0) return;

  const defaultRules = [
    {
      name: "Exact Match",
      ruleType: "exact_match",
      priority: 1,
      threshold: null,
      active: true,
      description: "Matches transactions with exact amount and same date between counterparties",
    },
    {
      name: "Date Tolerance Match",
      ruleType: "date_tolerance",
      priority: 2,
      threshold: 1,
      active: true,
      description: "Matches transactions with exact amount but allows date difference up to threshold days",
    },
    {
      name: "Reference Token Match",
      ruleType: "reference_match",
      priority: 3,
      threshold: null,
      active: true,
      description: "Matches transactions by extracting and comparing invoice/document reference numbers from narrations",
    },
    {
      name: "Narration Fuzzy Match",
      ruleType: "narration_match",
      priority: 4,
      threshold: 80,
      active: true,
      description: "Matches transactions with same amount and similar narration text above configured similarity threshold",
    },
    {
      name: "One-to-Many Aggregation",
      ruleType: "one_to_many",
      priority: 5,
      threshold: null,
      active: true,
      description: "Matches one debit transaction to multiple credit transactions where the sum equals the debit amount",
    },
    {
      name: "Many-to-One Aggregation",
      ruleType: "many_to_one",
      priority: 6,
      threshold: null,
      active: true,
      description: "Matches multiple debit transactions to one credit transaction where the sum equals the credit amount",
    },
    {
      name: "Amount Tolerance Match",
      ruleType: "amount_tolerance",
      priority: 7,
      threshold: 1,
      active: false,
      description: "Matches transactions where amount difference is within configured percentage tolerance",
    },
  ];

  await db.insert(reconciliationRules).values(defaultRules);
  console.log("Seeded default reconciliation rules");
}
