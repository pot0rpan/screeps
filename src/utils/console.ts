export function printTable(headings: string[], data: any[][]): void {
  console.log(
    table(
      thead(tr(headings.map(heading => td(heading)).join(''))) +
        tbody(data.map(el => tr(el.map(val => td(val)).join(''))).join(''))
    )
  );
}

function table(inner: string): string {
  return '<table>' + inner + '</table>';
}

function thead(inner: string): string {
  return '<thead style="border-bottom: 1px solid white">' + inner + '</thead>';
}

function tbody(inner: string): string {
  return '<tbody>' + inner + '</tbody>';
}

function tr(inner: string): string {
  return '<tr>' + inner + '</tr>';
}

function td(inner: string): string {
  return (
    '<td style="padding-right: 0.5em; padding-left: 0.5em">' + inner + '</td>'
  );
}

export function roomLink(roomName: string): string {
  return `<a href="https://screeps.com/a/#!/room/${Game.shard.name}/${roomName}">${roomName}</a>`;
}
