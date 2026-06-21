import { describe, it, expect } from "vitest";
import { AnswerFeedbackSchema, InterviewSummarySchema } from "./feedback";

const VALID_FEEDBACK = {
  relevance: 4,
  depth: 3,
  clarity: 5,
  overall: 4,
  strengths: ["Clear explanation", "Good use of examples"],
  improvements: ["Add more technical depth"],
  model_answer_hint: "Consider mentioning specific trade-offs you encountered.",
};

const VALID_SUMMARY = {
  avg_relevance: 4.2,
  avg_depth: 3.6,
  avg_clarity: 4.0,
  overall_score: 4,
  top_strengths: ["Strong communication", "Good technical grounding"],
  key_gaps: ["Lacks depth on system design"],
  recommended_actions: ["Study distributed systems basics", "Practice STAR format answers"],
  readiness: "moderate" as const,
};

describe("AnswerFeedbackSchema", () => {
  it("accepts a valid feedback object", () => {
    expect(AnswerFeedbackSchema.safeParse(VALID_FEEDBACK).success).toBe(true);
  });

  it("accepts minimum scores (all 1)", () => {
    const result = AnswerFeedbackSchema.safeParse({
      ...VALID_FEEDBACK,
      relevance: 1,
      depth: 1,
      clarity: 1,
      overall: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts maximum scores (all 5)", () => {
    const result = AnswerFeedbackSchema.safeParse({
      ...VALID_FEEDBACK,
      relevance: 5,
      depth: 5,
      clarity: 5,
      overall: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects relevance below 1", () => {
    expect(AnswerFeedbackSchema.safeParse({ ...VALID_FEEDBACK, relevance: 0 }).success).toBe(false);
  });

  it("rejects depth above 5", () => {
    expect(AnswerFeedbackSchema.safeParse({ ...VALID_FEEDBACK, depth: 6 }).success).toBe(false);
  });

  it("rejects clarity above 5", () => {
    expect(AnswerFeedbackSchema.safeParse({ ...VALID_FEEDBACK, clarity: 6 }).success).toBe(false);
  });

  it("rejects overall above 5", () => {
    expect(AnswerFeedbackSchema.safeParse({ ...VALID_FEEDBACK, overall: 6 }).success).toBe(false);
  });

  it("rejects non-integer scores", () => {
    expect(AnswerFeedbackSchema.safeParse({ ...VALID_FEEDBACK, relevance: 3.5 }).success).toBe(
      false
    );
  });

  it("accepts empty strengths and improvements arrays", () => {
    const result = AnswerFeedbackSchema.safeParse({
      ...VALID_FEEDBACK,
      strengths: [],
      improvements: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing model_answer_hint", () => {
    const { model_answer_hint: _m, ...rest } = VALID_FEEDBACK;
    expect(AnswerFeedbackSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing overall field", () => {
    const { overall: _o, ...rest } = VALID_FEEDBACK;
    expect(AnswerFeedbackSchema.safeParse(rest).success).toBe(false);
  });
});

describe("InterviewSummarySchema", () => {
  it("accepts a valid summary object", () => {
    expect(InterviewSummarySchema.safeParse(VALID_SUMMARY).success).toBe(true);
  });

  it("accepts all valid readiness values", () => {
    for (const readiness of ["low", "moderate", "high"] as const) {
      expect(InterviewSummarySchema.safeParse({ ...VALID_SUMMARY, readiness }).success).toBe(true);
    }
  });

  it("rejects an unknown readiness value", () => {
    expect(
      InterviewSummarySchema.safeParse({ ...VALID_SUMMARY, readiness: "medium" }).success
    ).toBe(false);
  });

  it("rejects overall_score below 1", () => {
    expect(InterviewSummarySchema.safeParse({ ...VALID_SUMMARY, overall_score: 0 }).success).toBe(
      false
    );
  });

  it("rejects overall_score above 5", () => {
    expect(InterviewSummarySchema.safeParse({ ...VALID_SUMMARY, overall_score: 6 }).success).toBe(
      false
    );
  });

  it("rejects non-integer overall_score", () => {
    expect(InterviewSummarySchema.safeParse({ ...VALID_SUMMARY, overall_score: 3.5 }).success).toBe(
      false
    );
  });

  it("rejects avg_relevance above 5", () => {
    expect(InterviewSummarySchema.safeParse({ ...VALID_SUMMARY, avg_relevance: 5.1 }).success).toBe(
      false
    );
  });

  it("rejects avg_relevance below 0", () => {
    expect(
      InterviewSummarySchema.safeParse({ ...VALID_SUMMARY, avg_relevance: -0.1 }).success
    ).toBe(false);
  });

  it("accepts fractional averages within bounds", () => {
    const result = InterviewSummarySchema.safeParse({
      ...VALID_SUMMARY,
      avg_relevance: 3.4,
      avg_depth: 2.8,
      avg_clarity: 4.6,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional session_id as a valid uuid", () => {
    const result = InterviewSummarySchema.safeParse({
      ...VALID_SUMMARY,
      session_id: "00000000-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects session_id that is not a uuid", () => {
    expect(
      InterviewSummarySchema.safeParse({ ...VALID_SUMMARY, session_id: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("accepts empty arrays for strengths, gaps, and actions", () => {
    const result = InterviewSummarySchema.safeParse({
      ...VALID_SUMMARY,
      top_strengths: [],
      key_gaps: [],
      recommended_actions: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing readiness field", () => {
    const { readiness: _r, ...rest } = VALID_SUMMARY;
    expect(InterviewSummarySchema.safeParse(rest).success).toBe(false);
  });
});
