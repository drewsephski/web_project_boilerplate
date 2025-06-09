import { z } from 'zod';

export const SelectorSchema = z.object({
  fieldName: z.string().min(1, "Field name cannot be empty."),
  cssSelector: z.string().min(1, "CSS selector cannot be empty."),
});

export const ScraperConfigSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters long."),
  url: z.string().url("Invalid URL format."),
  description: z.string().optional(),
  selectors: z.array(SelectorSchema).min(1, "At least one selector is required."),
  paginationEnabled: z.boolean().default(false),
  paginationNextSelector: z.string().optional(),
  maxDepth: z.number().int().positive("Max depth must be a positive integer.").optional(),
  status: z.enum(['active', 'paused', 'completed', 'error']).default('active'),
  schedule: z.string().optional(), // Could be a cron string or predefined values
  // createdAt and updatedAt will be handled by the database or ORM if used.
  // For direct MongoDB usage, we can add them here and set them manually or use DB features.
  // Let's assume they will be set manually for now if not using an ORM.
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type ScraperConfig = z.infer<typeof ScraperConfigSchema>;
export type Selector = z.infer<typeof SelectorSchema>;

// Example of how to ensure paginationNextSelector is present if paginationEnabled is true
// This can be done using .superRefine or .refine
export const RefinedScraperConfigSchema = ScraperConfigSchema.refine(data => {
  if (data.paginationEnabled && !data.paginationNextSelector) {
    return false;
  }
  return true;
}, {
  message: "paginationNextSelector is required if pagination is enabled.",
  path: ["paginationNextSelector"], // Path of the error
});

// If we want to ensure maxDepth is present when paginationEnabled is true
export const FurtherRefinedScraperConfigSchema = RefinedScraperConfigSchema.refine(data => {
  if (data.paginationEnabled && typeof data.maxDepth === 'undefined') {
    return false;
  }
  return true;
}, {
  message: "maxDepth is required if pagination is enabled",
  path: ["maxDepth"],
});

// For API usage, we'll likely use the refined schema for creation/update.
// For data retrieved from DB, the base ScraperConfigSchema might be sufficient.

export const CreateScraperSchema = FurtherRefinedScraperConfigSchema.omit({
  createdAt: true,
  updatedAt: true
});

export const UpdateScraperSchema = FurtherRefinedScraperConfigSchema.partial();

// Type for scraper config as it is stored in and retrieved from the DB for display
export type DashboardScraperConfig = z.infer<typeof ScraperConfigSchema> & {
  _id: string; // MongoDB ID as a string
  lastRunAt?: string | Date;
  lastRunStatus?: string;
  lastRunItemCount?: number;
  lastRunId?: string;
  lastRunErrorMessage?: string;
  // createdAt and updatedAt are already optional in ScraperConfigSchema
};
