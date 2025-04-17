import figlet from 'figlet';
import { kleur } from 'kleur';
import boxen from 'boxen';

export function displayBanner(): void {
  const banner = figlet.textSync('Datadog Migrator', {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default'
  });

  const boxOptions = {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan'
  };

  const message = boxen(`${kleur.cyan(banner)}\n${kleur.yellow('Incident.io <> Datadog migration tool')}`, boxOptions);
  
  console.log(message);
}