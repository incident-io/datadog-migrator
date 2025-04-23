import figlet from "figlet";
import kleur from "kleur";
import boxen, { Options } from "boxen";

export function displayBanner(): void {
  // Use figlet for normal builds
  try {
    const banner = figlet.textSync("Datadog Migrator", {
      font: "Standard",
      horizontalLayout: "default",
      verticalLayout: "default",
    });

    const boxOptions: Options = {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
    };

    const message = boxen(
      `${kleur.cyan(banner)}\n${kleur.yellow("incident.io <> PagerDuty Datadog migration tool")}`,
      boxOptions,
    );

    console.log(message);
  } catch (error) {
    // Fallback if figlet fails
    console.log(kleur.cyan("Datadog Migrator"));
    console.log(kleur.yellow("incident.io <> PagerDuty Datadog migration tool"));
    console.log("");
  }
}
