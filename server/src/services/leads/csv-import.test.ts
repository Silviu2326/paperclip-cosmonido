import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, suggestMapping } from "./csv-import.js";

describe("parseCsv", () => {
  it("handles quoted fields, doubled quotes, embedded newlines and CRLF", () => {
    const { rows, delimiter } = parseCsv('name,email,message\r\n"Ana, S.",ana@example.com,"said ""hi""\nthanks"\r\n');
    expect(delimiter).toBe(",");
    expect(rows).toEqual([
      ["name", "email", "message"],
      ["Ana, S.", "ana@example.com", 'said "hi"\nthanks'],
    ]);
  });

  it("detects semicolon and tab delimiters and strips the BOM", () => {
    expect(detectDelimiter("nombre;correo;telefono")).toBe(";");
    const { rows, delimiter } = parseCsv("﻿name\temail\nAna\tana@example.com\n");
    expect(delimiter).toBe("\t");
    expect(rows[0]).toEqual(["name", "email"]);
  });

  it("drops blank lines and rejects an unclosed quote", () => {
    expect(parseCsv("a,b\n\n1,2\n").rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(() => parseCsv('a,b\n"open,1')).toThrow();
  });
});

describe("suggestMapping", () => {
  it("maps Spanish and English headers to lead fields", () => {
    expect(suggestMapping(["Nombre completo", "Correo", "Teléfono", "Empresa", "Idioma"])).toEqual({
      name: "Nombre completo",
      email: "Correo",
      phone: "Teléfono",
      company: "Empresa",
      language: "Idioma",
    });
  });
});
