import { z } from 'zod'

// Vote input validation
export const VoteInputSchema = z.object({
  choice: z.union([z.literal(0), z.literal(1)]),
  weight: z.number().int().min(1),
  pollId: z.number().int().min(0),
})

// Poll creation validation
export const PollCreateSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(200)
    .refine((val) => !/<script/i.test(val), {
      message: 'Title must not contain script tags',
    }),
  description: z.string().max(1000).default(''),
  duration: z.number().int().min(300).max(604800),
})

// Ethereum address validation
export const EthAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')

export type VoteInput = z.infer<typeof VoteInputSchema>
export type PollCreateInput = z.infer<typeof PollCreateSchema>
