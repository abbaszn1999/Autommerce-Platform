import { describe, expect, it } from "vitest";
import { extractRowIdentifiers } from "./identifiers";

describe("extractRowIdentifiers", () => {
  it("never takes codes from links (found pages, image URLs)", () => {
    const ids = extractRowIdentifiers({
      Name: "Sony WH-1000XM5",
      "Source URLs":
        "Sony WH-1000XM5 (https://www.amazon.com/dp/B0BXYCS74H/ref=sr_1_3), www.sony.com/en/p/wh1000xm5-b?id=884213",
    });
    expect(ids.map((id) => id.value)).toEqual(["WH-1000XM5"]);
  });

  it("finds codes in any column without relying on column names, and skips prices and quantities", () => {
    const ids = extractRowIdentifiers({
      Code: "RCP1151426",
      Description: "2.4G RC ENGINEERING VEHICLE (YELLOW)",
      "Selling Price TTC": "299.99",
      Barcode: "3000000071502",
      "Tot Av. Qty.": "16",
    });
    const values = ids.map((id) => id.value);
    expect(values).toContain("RCP1151426");
    expect(values).toContain("3000000071502");
    expect(values).not.toContain("299.99");
    expect(values).not.toContain("16");
    expect(ids.find((id) => id.value === "RCP1151426")?.strong).toBe(true);
  });

  it("pulls model/version tokens and internal codes out of a free-text description", () => {
    const ids = extractRowIdentifiers({ Item: "Arduino Wifi Esp32-S3 631958 100432" });
    const byValue = new Map(ids.map((id) => [id.value, id]));
    expect(byValue.get("Esp32-S3")?.key).toBe("ESP32S3");
    expect(byValue.get("Esp32-S3")?.strong).toBe(true);
    expect(byValue.get("631958")?.strong).toBe(true);
    expect(byValue.has("100432")).toBe(true);
  });
});

describe("extractRowIdentifiers never treats quantities or measurements as identifiers", () => {
  it.each(["4PCS", "1000ML", "2.4G", "433MHz", "16GB", "PDQ30", "12V", "24PCS", "4K"])("skips %s", (token) => {
    expect(extractRowIdentifiers({ Description: `KUROMI KIT ${token} MIX` }).map((id) => id.value)).not.toContain(token);
  });

  it("still keeps the row's real codes next to them", () => {
    const ids = extractRowIdentifiers({ Code: "YWP1521278", Description: "KUROMI /KT 4PCS MIX", Barcode: "3000000050514" });
    expect(ids.map((id) => id.value).sort()).toEqual(["3000000050514", "YWP1521278"]);
  });
});

describe("extractRowIdentifiers with list-like columns", () => {
  it("ignores codes that only appear in similar / bought-with / keyword lists", () => {
    const ids = extractRowIdentifiers({
      product_name: "IC — AN241",
      filters: "Package: DIP | Manufacturer: Panasonic | Type: Audio Amplifier IC",
      keywords: "rf ics | sony rf ics | an241 rf ics | an355 rf ics | rf ic",
      similar: "IC — AN5732 [31] | IC — GL3201 [2875] | IC — AN5256 [217584]",
    });
    expect(ids.map((id) => id.value)).toEqual(["AN241"]);
  });

  it("keeps a code from a list segment labelled as an identifier", () => {
    const ids = extractRowIdentifiers({ specs: "MPN: XK-2231 | Colour: black | Buttons: 3" });
    expect(ids.map((id) => id.value)).toEqual(["XK-2231"]);
  });

  it("keeps several codes in an ordinary description", () => {
    const ids = extractRowIdentifiers({ Item: "Arduino Wifi Esp32-S3 631958 100432" });
    expect(ids).toHaveLength(3);
  });
});
