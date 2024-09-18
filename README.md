# ⌨️ Inputs

Package to decode ANSI sequences from stdin.

## 📇 Supported modes

<table>
    <thead>
        <tr>
            <th>Type</th>
            <th colspan="2">Name</th>
            <th>Status</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td align="center" rowspan="2">Keyboard</td>
            <td align="center" colspan="2">XTerm/Legacy</td>
            <td align="center">✅</td>
        </tr>
        <tr>
          <td align="center" colspan="2">Kitty</td>
          <td align="center" title="Around 80% complete, doesn't support one type of sequences and lacks tests">🟧</td>
        </tr>
        <tr>
          <td align="center" rowspan="8">Mouse</td>
          <th>Encoding</th>
          <th>Mode</th>
          <th>Status</th>
        </tr>
        <tr>
          <td rowspan="5">
            X10 (<code>CSI ? 9 h</code>/<code>CSI ? 1000 h</code>) <br />
            UTF-8 (<code>CSI ? 1005 h </code>) <br />
            SGR (<code>CSI ? 1006 h</code>) <br />
            SGR-Pixels (<code>CSI ? 1016 h</code>) <br />
            URXVT (<code>CSI ? 1015 h</code>)
          </td>
          <td>X10 compatibility (<code>CSI ? 9 h</code>)</td>
          <td align="center">✅</td>
        </tr>
        <tr>
          <td>Normal tracking (<code>CSI ? 1000 h</code>)</td>
          <td align="center">✅</td>
        </tr>
        <tr>
          <td>Button-event tracking (<code>CSI ? 1002 h</code>)</td>
          <td align="center">✅</td>
        </tr>
        <tr>
          <td>Any-event tracking (<code>CSI ? 1003 h</code>)</td>
          <td align="center">✅</td>
        </tr>
    </tbody>
</table>

##

## 📝 Licensing

This project is available under **MIT** License conditions.
