import { SSOP_CSV_TEMPLATE } from "@/lib/ssop/csv";

export function GET() {
  return new Response(SSOP_CSV_TEMPLATE + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="ssop-steps-template.csv"',
    },
  });
}
