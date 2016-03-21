// ==UserScript==
// @name         Смайлопак «{{ pack_name }}»
// @version      {{ pack.version }}
// @description  Создан {{ pack.created_at.strftime('%Y-%m-%d') }}
// @namespace    {{ url_for('pages.index', _external=True) }}userscripts
// @icon         {{ pack_ico_url }}
// @grant        none
// @noframes
{% if websites_mode == 'blacklist' -%}
// @match        http://*/*
// @match        https://*/*
{% endif -%}
{% if show_update_urls -%}
// @downloadURL  {{ url_for('smilepacks.download_compat', smp_hid=pack.hid, mode='user', _external=True) }}
// @updateURL    {{ url_for('smilepacks.download_compat', smp_hid=pack.hid, mode='meta', _external=True) }}
{% endif -%}
{% for site in websites_list -%}
    // @{{ 'match        ' if websites_mode == 'whitelist' else 'exclude      ' }}{{ site }}
{% endfor -%}
// @exclude      http://*.google.*
// @exclude      https://*.google.*
// @author       Код: EeyupBrony, Dark_XSM, Dotterian; адаптировал andreymal
// ==/UserScript==
