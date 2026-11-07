import { describe, expect, it } from "vitest";
import { createCustomerSchema, updateCustomerSchema } from "./crm.js";

describe("customer profile fields", () => {
  it("accepts a name without contact, address, fiscal data or domain", () => {
    expect(createCustomerSchema.parse({ name: "Cliente" })).toEqual({ name: "Cliente", kind: "organization", tags: [] });
  });

  it("preserves optional details and trims text", () => {
    expect(createCustomerSchema.parse({
      name: " Cliente ", contactName: " Ana ", contactEmail: " ana@example.com ", phone: " +34 612 345 678 ",
      address: " Calle Mayor 1 ", city: " Madrid ", postalCode: " 28001 ", country: " España ",
      legalName: " Cliente SL ", taxId: " B12345678 ",
    })).toMatchObject({
      contactName: "Ana", contactEmail: "ana@example.com", phone: "+34 612 345 678",
      address: "Calle Mayor 1", city: "Madrid", postalCode: "28001", country: "España",
      legalName: "Cliente SL", taxId: "B12345678",
    });
  });

  it("allows clearing optional fields without inserting defaults on update", () => {
    expect(updateCustomerSchema.parse({ phone: null, taxId: null })).toEqual({ phone: null, taxId: null });
  });

  it("rejects invalid email and oversized profile values", () => {
    expect(createCustomerSchema.safeParse({ name: "Cliente", contactEmail: "no-email" }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: "Cliente", address: "a".repeat(501) }).success).toBe(false);
  });
});
