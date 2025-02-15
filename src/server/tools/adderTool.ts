import { z } from "zod";
import { tool } from "@langchain/core/tools";

const adderSchema = z.object({
  a: z.number(),
  b: z.number(),
});

export const adderTool = tool(
  async (input): Promise<string> => {
    const sum = input.a + input.b;
    return `The sum of ${input.a} and ${input.b} is ${sum}`;
  },
  {
    name: "adder",
    description: "Adds two numbers together",
    schema: adderSchema,
  }
); 