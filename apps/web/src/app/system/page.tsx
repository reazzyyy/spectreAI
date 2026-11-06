import type { Metadata } from "next";
import { SystemMap } from "@/widgets/system-map";

export const metadata: Metadata = {
  title: "Карта системы · НейроЮрист Спектр",
  description: "Наглядное AS-IS: слои, сущности, путь запроса и что ещё впереди",
};

export default function SystemPage() {
  return <SystemMap />;
}
