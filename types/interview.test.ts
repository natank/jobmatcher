import { describe, it, expect } from "vitest";
import { QuestionSchema, InterviewSessionSchema } from "./interview";

const VALID_QUESTION = {
  index: 0,
  text: "Describe your work on the my-repo project.",
  type: "technical" as const,
  repo_ref: "my-repo",
};

const VALID_QUESTIONS = [
  { index: 0, text: "Describe your work on repo-a.", type: "technical", repo_ref: "repo-a" },
  { index: 1, text: "Describe your work on repo-b.", type: "technical", repo_ref: "repo-b" },
  { index: 2, text: "How do you handle TypeScript errors?", type: "job", repo_ref: null },
  { index: 3, text: "What is your experience with React?", type: "job", repo_ref: null },
  { index: 4, text: "Tell me about a challenge you overcame.", type: "behavioral", repo_ref: null },
];

describe("QuestionSchema", () => {
  it("accepts a valid technical question with repo_ref", () => {
    expect(QuestionSchema.safeParse(VALID_QUESTION).success).toBe(true);
  });

  it("accepts a behavioral question with null repo_ref", () => {
    const result = QuestionSchema.safeParse({
      index: 4,
      text: "Tell me about a challenge.",
      type: "behavioral",
      repo_ref: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid question types", () => {
    for (const type of ["technical", "job", "behavioral"] as const) {
      expect(QuestionSchema.safeParse({ ...VALID_QUESTION, type }).success).toBe(true);
    }
  });

  it("rejects an unknown question type", () => {
    expect(QuestionSchema.safeParse({ ...VALID_QUESTION, type: "hypothetical" }).success).toBe(
      false
    );
  });

  it("rejects index below 0", () => {
    expect(QuestionSchema.safeParse({ ...VALID_QUESTION, index: -1 }).success).toBe(false);
  });

  it("rejects index above 4", () => {
    expect(QuestionSchema.safeParse({ ...VALID_QUESTION, index: 5 }).success).toBe(false);
  });

  it("rejects a missing text field", () => {
    const { text: _t, ...rest } = VALID_QUESTION;
    expect(QuestionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing repo_ref field (undefined is not null)", () => {
    const { repo_ref: _r, ...rest } = VALID_QUESTION;
    expect(QuestionSchema.safeParse(rest).success).toBe(false);
  });

  it("accepts index at boundary values 0 and 4", () => {
    expect(QuestionSchema.safeParse({ ...VALID_QUESTION, index: 0 }).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...VALID_QUESTION, index: 4 }).success).toBe(true);
  });
});

describe("InterviewSessionSchema", () => {
  const VALID_SESSION = {
    job_id: "00000000-0000-0000-0000-000000000001",
    status: "active" as const,
    questions: VALID_QUESTIONS,
  };

  it("accepts a minimal valid session", () => {
    expect(InterviewSessionSchema.safeParse(VALID_SESSION).success).toBe(true);
  });

  it("accepts a completed session with optional fields", () => {
    const result = InterviewSessionSchema.safeParse({
      ...VALID_SESSION,
      id: "00000000-0000-0000-0000-000000000002",
      user_id: "00000000-0000-0000-0000-000000000003",
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid status values", () => {
    for (const status of ["active", "completed", "abandoned"] as const) {
      expect(InterviewSessionSchema.safeParse({ ...VALID_SESSION, status }).success).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(InterviewSessionSchema.safeParse({ ...VALID_SESSION, status: "pending" }).success).toBe(
      false
    );
  });

  it("rejects questions array with fewer than 5 items", () => {
    expect(
      InterviewSessionSchema.safeParse({ ...VALID_SESSION, questions: VALID_QUESTIONS.slice(0, 4) })
        .success
    ).toBe(false);
  });

  it("rejects questions array with more than 5 items", () => {
    const extra = [...VALID_QUESTIONS, { ...VALID_QUESTIONS[0], index: 5 }];
    expect(InterviewSessionSchema.safeParse({ ...VALID_SESSION, questions: extra }).success).toBe(
      false
    );
  });

  it("rejects a missing job_id", () => {
    const { job_id: _j, ...rest } = VALID_SESSION;
    expect(InterviewSessionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid job_id (not a uuid)", () => {
    expect(
      InterviewSessionSchema.safeParse({ ...VALID_SESSION, job_id: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("accepts null completed_at", () => {
    expect(InterviewSessionSchema.safeParse({ ...VALID_SESSION, completed_at: null }).success).toBe(
      true
    );
  });
});
