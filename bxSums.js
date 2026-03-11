// ==UserScript==
// @name         Bitrix-Sums
// @version      2.43
// @description  Summiert Stunden und Story Points in Bitrix-Boards und Sprints (mit Rest-Tags Unterstützung)
// @author       Michael E.
// @updateURL    https://mobimedia.github.io/bxSums/bxSums.meta.js
// @downloadURL  https://mobimedia.github.io/bxSums/bxSums.js
// @include      https://bitrix.*.de/*
// @grant        none
// @require https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js
// @require https://underscorejs.org/underscore-min.js
// ==/UserScript==

var
    loadingPagesCount = {},
    maxLoadingSecondsPerColumn = 4;

(function() {
    'use strict';
    window._$ = window.$.noConflict(true);

    if (window.localStorage.getItem("calcMode") === null) {
        window.localStorage.setItem("calcMode", '1');
    }

    if (window.localStorage.getItem("showPics") === null) {
        window.localStorage.setItem("showPics", '1');
    }
    if (window.localStorage.getItem("showMode") === null) {
        window.localStorage.setItem("showMode", '1');
    }
    _$("head").append(
        '<link id="bxSumsLink" href="https://mobimedia.github.io/bxSums/bxSumsCards.css?36" rel="stylesheet" type="text/css">'
    );
//     if (_$(".main-kanban-column").length || _$("#bizproc_task_list_table").length || _$(".tasks-iframe-header").length || _$(".tasks-scrum__scope").length) {
//         _$("head").append(
//             '<link id="bxSumsLink" href="https://mobimedia.github.io/bxSums/bxSumsCards.css?40" rel="stylesheet" type="text/css">'
//         );
//     }

    handleTags();

    // Beim Klick auf den Titel einer Liste werden alle Karten darin in neuen Tabs geoeffnet
    _$(".main-kanban-column-title-info").attr("title", "\u24d8 Doppelklick um alle Karten in neuen Tabs zu öffnen.").dblclick(function (event) {
        var
            urls = [];

        _$(this).parents(".main-kanban-column").find(".tasks-kanban-item-title").each(function () {
            urls.push(window.location.origin + _$(this).attr("href").split("?")[0]);
        });

        if (!urls.length) {
            return alert("Die Spalte enthaelt keine Karten...");
        }

        if (event.shiftKey) {
            copyToClipboard(urls.join("\n"));
        } else {
            for (var i = 0; i < urls.length; i++) {
                window.open(urls[i], "_blank");
            }
        }
    });


    setMenuItems();
    useSettings();
    handleTaskLinkCopy();

    _$("#tasks-flow-selector-container .ui-btn-text-inner").text("Flow");
    _$(".ui-toolbar.--air.--multiline-title .ui-toolbar-right-buttons").css("gap", "0 4px");

    // WICHTIG: setupTaskCloseObserver muss IMMER laufen, nicht nur wenn useCalc() aktiv ist
    // Warte kurz bis BX verfügbar ist
    _.delay(function() {
        setupTaskCloseObserver();
    }, 500);
})();

// Erstellt Buttons für Markdown-Link-Kopieren und Excel-Daten-Kopieren
function handleTaskLinkCopy() {
    const taskId = getTaskId(true);
    if (!taskId) {
        return;
    }
    // SVG für Markdown-Button als Base64 kodiert
    const markdownSvgBase64 = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTMiIGhlaWdodD0iMTMiIHZpZXdCb3g9IjAgMCAxMyAxMyIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzM2NF85KSI+CjxwYXRoIGQ9Ik01Ljg5MDYyIDMuNjU5MThDNi4zNDM2NSAzLjY1OTI0IDYuNzkyNDEgMy43NDg0NyA3LjIxMDk0IDMuOTIxODhDNy42Mjk0OSA0LjA5NTMzIDguMDA5NzYgNC4zNDk1IDguMzMwMDggNC42Njk5MkM4LjUzMzY3IDQuODc4NzkgOC43MDk4OSA1LjExMzMyIDguODUzNTIgNS4zNjcxOUw3LjcxOTczIDYuNUM3LjY2NTc4IDYuNTUzODMgNy42MDAwMyA2LjU4NDE2IDcuNTM2MTMgNi42MjEwOUM3LjQ1NzEzIDYuMzU0MDkgNy4zMjAzNSA2LjA5OTY1IDcuMTEwMzUgNS44ODk2NUM2Ljc4NjgxIDUuNTY2MzggNi4zNDc5OCA1LjM4NDg4IDUuODkwNjIgNS4zODQ3N0M1LjQzMzA5IDUuMzg0NzcgNC45OTM1NyA1LjU2NjI1IDQuNjY5OTIgNS44ODk2NUwyLjIzMDQ3IDguMzMwMDhDMS45MDc1OCA4LjY1Mzk2IDEuNzI1NjIgOS4wOTI0OCAxLjcyNTU5IDkuNTQ5OEMxLjcyNTU5IDEwLjAwNzEgMS45MDc1OSAxMC40NDU2IDIuMjMwNDcgMTAuNzY5NUMyLjU1NDM4IDExLjA5MjQgMi45OTI4MiAxMS4yNzQ0IDMuNDUwMiAxMS4yNzQ0QzMuOTA3NTcgMTEuMjc0NCA0LjM0NjAxIDExLjA5MjQgNC42Njk5MiAxMC43Njk1TDUuNTM4MDkgOS45MDIzNEM1LjY5NjM1IDkuOTYzMSA1Ljg1ODE3IDEwLjAxMjEgNi4wMjE0OCAxMC4wNTM3QzYuMDA3MDMgMTAuMjAwNSA2IDEwLjM0OTQgNiAxMC41QzYgMTAuOTIwMyA2LjA1ODI0IDExLjMyNyA2LjE2NjAyIDExLjcxMjlMNS44OTA2MiAxMS45OTAyQzUuMjQzNSAxMi42Mzc0IDQuMzY1MzcgMTMuMDAxIDMuNDUwMiAxMy4wMDFDMi41MzUwMiAxMy4wMDEgMS42NTY4OSAxMi42Mzc0IDEuMDA5NzcgMTEuOTkwMkMwLjM2MjY3NCAxMS4zNDMxIDYuODE4NGUtMDkgMTAuNDY1IDAgOS41NDk4QzMuMjA2NDhlLTA1IDguNjM0ODcgMC4zNjI5MzMgNy43NTc0MSAxLjAwOTc3IDcuMTEwMzVMMy40NTAyIDQuNjY5OTJDMy43NzA1IDQuMzQ5NDkgNC4xNTA3OSA0LjA5NTM0IDQuNTY5MzQgMy45MjE4OEM0Ljk4OCAzLjc0ODQxIDUuNDM3NDUgMy42NTkxOCA1Ljg5MDYyIDMuNjU5MThaTTUuNDYzODcgNi4zNzc5M0M1LjU0Mjg3IDYuNjQ1OTMgNS42Nzk2MyA2Ljg5OTM1IDUuODkwNjIgNy4xMTAzNUM2LjIwMDA3IDcuNDE4OTggNi42MTQ1IDcuNTk2MDkgNy4wNDk4IDcuNjExMzNDNi42NjA5MyA4LjA3NTMgNi4zNjM3MiA4LjYxODY5IDYuMTg2NTIgOS4yMTM4N0M2LjA1MjA2IDkuMTc2NDkgNS45MTk1MSA5LjEzMTc1IDUuNzkwMDQgOS4wNzgxMkM1LjM3MTM4IDguOTA0NjYgNC45OTAzIDguNjUwNTggNC42Njk5MiA4LjMzMDA4QzQuNDY2NTUgOC4xMjExOSA0LjI5MSA3Ljg4Njk5IDQuMTQ2NDggNy42MzM3OUw1LjI4MDI3IDYuNUM1LjMzNDIgNi40NDYwNyA1LjM5OTk1IDYuNDE0ODcgNS40NjM4NyA2LjM3NzkzWk05LjU0OTggMEMxMC40NjQ5IDYuODE4MzZlLTA5IDExLjM0MzEgMC4zNjM2NTggMTEuOTkwMiAxLjAxMDc0QzEyLjYzNzQgMS42NTc4NyAxMy4wMDEgMi41MzU5OSAxMy4wMDEgMy40NTExN0MxMy4wMDA5IDQuMzY2MTkgMTIuNjM3MiA1LjI0MjU5IDExLjk5MDIgNS44ODk2NUwxMS43MTI5IDYuMTY2MDJDMTEuMzI3IDYuMDU4MjQgMTAuOTIwMyA2IDEwLjUgNkMxMC4wNzI5IDYgOS42NjAwMyA2LjA2MDcxIDkuMjY4NTUgNi4xNzE4OEwxMC43NzA1IDQuNjY5OTJDMTEuMDkzNyA0LjM0NjM1IDExLjI3NTMgMy45MDc1NiAxMS4yNzU0IDMuNDUwMkMxMS4yNzU0IDIuOTkyNjYgMTEuMDkzOSAyLjU1MzE0IDEwLjc3MDUgMi4yMjk0OUMxMC40NDY3IDEuOTA2MzcgMTAuMDA3MiAxLjcyNTU5IDkuNTQ5OCAxLjcyNTU5QzkuMDkyNTcgMS43MjU2OSA4LjY1Mzc1IDEuOTA2NTIgOC4zMzAwOCAyLjIyOTQ5TDcuNDYxOTEgMy4wOTg2M0M2Ljc2MTg2IDIuODI5NDggNi4wMDMzNCAyLjc0NzQzIDUuMjYxNzIgMi44NTkzOEw3LjExMDM1IDEuMDEwNzRDNy43NTczNyAwLjM2MzgxMiA4LjYzNDg1IDAuMDAwMTAyNzU1IDkuNTQ5OCAwWiIgZmlsbD0iIzgwODY4RSIvPgo8cGF0aCBkPSJNNy4zNTIgMTJWNy45MTJIOC4xOTJWOC45Mkw4LjA0OCA4Ljg0QzguMDg4IDguNTIgOC4xODQgOC4yNjkzMyA4LjMzNiA4LjA4OEM4LjQ5MDY3IDcuOTA2NjcgOC42ODUzMyA3LjgxNiA4LjkyIDcuODE2QzkuMTI4IDcuODE2IDkuMjkzMzMgNy44Nzg2NyA5LjQxNiA4LjAwNEM5LjUzODY3IDguMTI5MzMgOS42MjQgOC4yNjQgOS42NzIgOC40MDhDOS43NjUzMyA4LjI1ODY3IDkuODg2NjcgOC4xMjI2NyAxMC4wMzYgOEMxMC4xODggNy44NzczMyAxMC4zNzYgNy44MTYgMTAuNiA3LjgxNkMxMC45MiA3LjgxNiAxMS4xNjI3IDcuOTMwNjcgMTEuMzI4IDguMTZDMTEuNDkzMyA4LjM4OTMzIDExLjU3NiA4Ljc5MiAxMS41NzYgOS4zNjhWMTJIMTAuNzM2VjkuNTA0QzEwLjczNiA5LjIyNCAxMC43MTA3IDkuMDIgMTAuNjYgOC44OTJDMTAuNjA5MyA4Ljc2MTMzIDEwLjUwOTMgOC42OTYgMTAuMzYgOC42OTZDMTAuMjY2NyA4LjY5NiAxMC4xODUzIDguNzI4IDEwLjExNiA4Ljc5MkMxMC4wNDkzIDguODU2IDkuOTk3MzMgOC45NDkzMyA5Ljk2IDkuMDcyQzkuOTIyNjcgOS4xOTIgOS45MDQgOS4zMzg2NyA5LjkwNCA5LjUxMlYxMkg5LjA2NFY5LjQ4QzkuMDY0IDkuMzE0NjcgOS4wNTA2NyA5LjE3MzMzIDkuMDI0IDkuMDU2QzguOTk3MzMgOC45Mzg2NyA4Ljk1NiA4Ljg0OTMzIDguOSA4Ljc4OEM4Ljg0NCA4LjcyNjY3IDguNzcwNjcgOC42OTYgOC42OCA4LjY5NkM4LjU4MTMzIDguNjk2IDguNDk0NjcgOC43MjggOC40MiA4Ljc5MkM4LjM0OCA4Ljg1NiA4LjI5MiA4Ljk0OTMzIDguMjUyIDkuMDcyQzguMjEyIDkuMTkyIDguMTkyIDkuMzM4NjcgOC4xOTIgOS41MTJWMTJINy4zNTJaIiBmaWxsPSIjODA4NjhFIi8+CjwvZz4KPGRlZnM+CjxjbGlwUGF0aCBpZD0iY2xpcDBfMzY0XzkiPgo8cmVjdCB3aWR0aD0iMTMiIGhlaWdodD0iMTMiIGZpbGw9IndoaXRlIi8+CjwvY2xpcFBhdGg+CjwvZGVmcz4KPC9zdmc+Cg==";

    // SVG für Excel-Button als Base64 kodiert (Tabellen-Icon)
    const excelSvgBase64 = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTMiIGhlaWdodD0iMTMiIHZpZXdCb3g9IjAgMCAxMyAxMyIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzM2NF8xNikiPgo8cGF0aCBkPSJNNS44OTA2MiAzLjY1OTE4QzYuMzQzNjUgMy42NTkyNCA2Ljc5MjQxIDMuNzQ4NDcgNy4yMTA5NCAzLjkyMTg4QzcuNjI5NDkgNC4wOTUzMyA4LjAwOTc2IDQuMzQ5NSA4LjMzMDA4IDQuNjY5OTJDOC41MzM2NyA0Ljg3ODc5IDguNzA5ODkgNS4xMTMzMiA4Ljg1MzUyIDUuMzY3MTlMNy43MTk3MyA2LjVDNy42NjU3OCA2LjU1MzgzIDcuNjAwMDMgNi41ODQxNiA3LjUzNjEzIDYuNjIxMDlDNy40NTcxMyA2LjM1NDA5IDcuMzIwMzUgNi4wOTk2NSA3LjExMDM1IDUuODg5NjVDNi43ODY4MSA1LjU2NjM4IDYuMzQ3OTggNS4zODQ4OCA1Ljg5MDYyIDUuMzg0NzdDNS40MzMwOSA1LjM4NDc3IDQuOTkzNTcgNS41NjYyNSA0LjY2OTkyIDUuODg5NjVMMi4yMzA0NyA4LjMzMDA4QzEuOTA3NTggOC42NTM5NiAxLjcyNTYyIDkuMDkyNDggMS43MjU1OSA5LjU0OThDMS43MjU1OSAxMC4wMDcxIDEuOTA3NTkgMTAuNDQ1NiAyLjIzMDQ3IDEwLjc2OTVDMi41NTQzOCAxMS4wOTI0IDIuOTkyODIgMTEuMjc0NCAzLjQ1MDIgMTEuMjc0NEMzLjkwNzU3IDExLjI3NDQgNC4zNDYwMSAxMS4wOTI0IDQuNjY5OTIgMTAuNzY5NUw1LjUzODA5IDkuOTAyMzRDNS42OTYzNSA5Ljk2MzEgNS44NTgxNyAxMC4wMTIxIDYuMDIxNDggMTAuMDUzN0M2LjAwNzAzIDEwLjIwMDUgNiAxMC4zNDk0IDYgMTAuNUM2IDEwLjkyMDMgNi4wNTgyNCAxMS4zMjcgNi4xNjYwMiAxMS43MTI5TDUuODkwNjIgMTEuOTkwMkM1LjI0MzUgMTIuNjM3NCA0LjM2NTM3IDEzLjAwMSAzLjQ1MDIgMTMuMDAxQzIuNTM1MDIgMTMuMDAxIDEuNjU2ODkgMTIuNjM3NCAxLjAwOTc3IDExLjk5MDJDMC4zNjI2NzQgMTEuMzQzMSA2LjgxODRlLTA5IDEwLjQ2NSAwIDkuNTQ5OEMzLjIwNjQ4ZS0wNSA4LjYzNDg3IDAuMzYyOTMzIDcuNzU3NDEgMS4wMDk3NyA3LjExMDM1TDMuNDUwMiA0LjY2OTkyQzMuNzcwNSA0LjM0OTQ5IDQuMTUwNzkgNC4wOTUzNCA0LjU2OTM0IDMuOTIxODhDNC45ODggMy43NDg0MSA1LjQzNzQ1IDMuNjU5MTggNS44OTA2MiAzLjY1OTE4Wk01LjQ2Mzg3IDYuMzc3OTNDNS41NDI4NyA2LjY0NTkzIDUuNjc5NjMgNi44OTkzNSA1Ljg5MDYyIDcuMTEwMzVDNi4yMDAwNyA3LjQxODk4IDYuNjE0NSA3LjU5NjA5IDcuMDQ5OCA3LjYxMTMzQzYuNjYwOTMgOC4wNzUzIDYuMzYzNzIgOC42MTg2OSA2LjE4NjUyIDkuMjEzODdDNi4wNTIwNiA5LjE3NjQ5IDUuOTE5NTEgOS4xMzE3NSA1Ljc5MDA0IDkuMDc4MTJDNS4zNzEzOCA4LjkwNDY2IDQuOTkwMyA4LjY1MDU4IDQuNjY5OTIgOC4zMzAwOEM0LjQ2NjU1IDguMTIxMTkgNC4yOTEgNy44ODY5OSA0LjE0NjQ4IDcuNjMzNzlMNS4yODAyNyA2LjVDNS4zMzQyIDYuNDQ2MDcgNS4zOTk5NSA2LjQxNDg3IDUuNDYzODcgNi4zNzc5M1pNOS41NDk4IDBDMTAuNDY0OSA2LjgxODM2ZS0wOSAxMS4zNDMxIDAuMzYzNjU4IDExLjk5MDIgMS4wMTA3NEMxMi42Mzc0IDEuNjU3ODcgMTMuMDAxIDIuNTM1OTkgMTMuMDAxIDMuNDUxMTdDMTMuMDAwOSA0LjM2NjE5IDEyLjYzNzIgNS4yNDI1OSAxMS45OTAyIDUuODg5NjVMMTEuNzEyOSA2LjE2NjAyQzExLjMyNyA2LjA1ODI0IDEwLjkyMDMgNiAxMC41IDZDMTAuMDcyOSA2IDkuNjYwMDMgNi4wNjA3MSA5LjI2ODU1IDYuMTcxODhMMTAuNzcwNSA0LjY2OTkyQzExLjA5MzcgNC4zNDYzNSAxMS4yNzUzIDMuOTA3NTYgMTEuMjc1NCAzLjQ1MDJDMTEuMjc1NCAyLjk5MjY2IDExLjA5MzkgMi41NTMxNCAxMC43NzA1IDIuMjI5NDlDMTAuNDQ2NyAxLjkwNjM3IDEwLjAwNzIgMS43MjU1OSA5LjU0OTggMS43MjU1OUM5LjA5MjU3IDEuNzI1NjkgOC42NTM3NSAxLjkwNjUyIDguMzMwMDggMi4yMjk0OUw3LjQ2MTkxIDMuMDk4NjNDNi43NjE4NiAyLjgyOTQ4IDYuMDAzMzQgMi43NDc0MyA1LjI2MTcyIDIuODU5MzhMNy4xMTAzNSAxLjAxMDc0QzcuNzU3MzcgMC4zNjM4MTIgOC42MzQ4NSAwLjAwMDEwMjc1NSA5LjU0OTggMFoiIGZpbGw9IiM4MDg2OEUiLz4KPHBhdGggZD0iTTkuNDg4IDEyLjA5NkM5LjEzMzMzIDEyLjA5NiA4LjgxMDY3IDEyLjAyOTMgOC41MiAxMS44OTZDOC4yMjkzMyAxMS43NiA3Ljk5NzMzIDExLjU4NCA3LjgyNCAxMS4zNjhMOC40MzIgMTAuODE2QzguNTQ0IDEwLjkyOCA4LjY5MiAxMS4wMzYgOC44NzYgMTEuMTRDOS4wNiAxMS4yNDQgOS4yOCAxMS4yOTYgOS41MzYgMTEuMjk2QzkuNzIgMTEuMjk2IDkuODcyIDExLjI2NTMgOS45OTIgMTEuMjA0QzEwLjExNDcgMTEuMTQyNyAxMC4xNzYgMTEuMDQgMTAuMTc2IDEwLjg5NkMxMC4xNzYgMTAuODA1MyAxMC4xMzg3IDEwLjcyOCAxMC4wNjQgMTAuNjY0QzkuOTg5MzMgMTAuNTk3MyA5Ljg4IDEwLjUzMzMgOS43MzYgMTAuNDcyQzkuNTkyIDEwLjQxMDcgOS40MTYgMTAuMzQxMyA5LjIwOCAxMC4yNjRDOC45NDkzMyAxMC4xNjggOC43MjEzMyAxMC4wNjQgOC41MjQgOS45NTJDOC4zMjkzMyA5Ljg0IDguMTc3MzMgOS43MDQgOC4wNjggOS41NDRDNy45NTg2NyA5LjM4MTMzIDcuOTA0IDkuMTc4NjcgNy45MDQgOC45MzZDNy45MDQgOC42OTg2NyA3Ljk3MzMzIDguNDk3MzMgOC4xMTIgOC4zMzJDOC4yNTMzMyA4LjE2NCA4LjQ0MjY3IDguMDM2IDguNjggNy45NDhDOC45MiA3Ljg2IDkuMTg2NjcgNy44MTYgOS40OCA3LjgxNkM5LjgzMiA3LjgxNiAxMC4xMzQ3IDcuODc4NjcgMTAuMzg4IDguMDA0QzEwLjY0MTMgOC4xMjkzMyAxMC44NDggOC4yODI2NyAxMS4wMDggOC40NjRMMTAuMzg0IDguOTc2QzEwLjI4IDguODgyNjcgMTAuMTQ5MyA4LjggOS45OTIgOC43MjhDOS44MzQ2NyA4LjY1MzMzIDkuNjQgOC42MTYgOS40MDggOC42MTZDOS4yMzIgOC42MTYgOS4wODY2NyA4LjY0MjY3IDguOTcyIDguNjk2QzguODU3MzMgOC43NDkzMyA4LjggOC44MzQ2NyA4LjggOC45NTJDOC44IDkuMDM0NjcgOC44Mzg2NyA5LjEwOCA4LjkxNiA5LjE3MkM4Ljk5NiA5LjIzMzMzIDkuMTAyNjcgOS4yOTIgOS4yMzYgOS4zNDhDOS4zNjkzMyA5LjQwNCA5LjUxNzMzIDkuNDYxMzMgOS42OCA5LjUyQzkuOTE0NjcgOS42MDUzMyAxMC4xMzczIDkuNzAxMzMgMTAuMzQ4IDkuODA4QzEwLjU2MTMgOS45MTQ2NyAxMC43MzQ3IDEwLjA1MzMgMTAuODY4IDEwLjIyNEMxMS4wMDQgMTAuMzkyIDExLjA3MiAxMC42MTMzIDExLjA3MiAxMC44ODhDMTEuMDcyIDExLjI3MiAxMC45MjY3IDExLjU2OTMgMTAuNjM2IDExLjc4QzEwLjM0OCAxMS45OTA3IDkuOTY1MzMgMTIuMDk2IDkuNDg4IDEyLjA5NloiIGZpbGw9IiM4MDg2OEUiLz4KPC9nPgo8ZGVmcz4KPGNsaXBQYXRoIGlkPSJjbGlwMF8zNjRfMTYiPgo8cmVjdCB3aWR0aD0iMTMiIGhlaWdodD0iMTMiIGZpbGw9IndoaXRlIi8+CjwvY2xpcFBhdGg+CjwvZGVmcz4KPC9zdmc+Cg==";

    // Prüfen ob die Buttons bereits existieren
    if (_$(".ui-toolbar-markdown-copy-button").length || _$(".ui-toolbar-excel-copy-button").length) {
        return;
    }

    // Markdown-Button erstellen
    const $markdownButton = _$('<span>')
        .addClass('ui-btn ui-btn-light-border ui-icon-set__scope --air ui-btn-no-caps --with-left-icon ui-btn-icon-follow --style-outline ui-btn-sm ui-btn-collapsed ui-toolbar-markdown-copy-button')
        .attr('title', 'Link als Markdown kopieren')
        .css({
            'background-image': `url(${markdownSvgBase64})`,
            'background-repeat': 'no-repeat',
            'background-color': '#fff',
            'background-position': 'center',
            'background-size': '12px 12px',
            'width': '32px',
            'height': '28px',
            'cursor': 'pointer',
            'margin-right': '0'
        })
        .bind("click", (ev) => {
            copyToClipboard("[" + taskId + " - " + document.title.replace(/\[.*?\]/g, "").trim() + "](" + BX.util.remove_url_param(window.location.href, ["IFRAME", "IFRAME_TYPE"]) + ")", true);
            ev.preventDefault();
            ev.stopPropagation();
            showCopyPopup(ev.target, "Markdown-Link kopiert!");
        });

    // Excel-Button erstellen
    const $excelButton = _$('<span>')
        .addClass('ui-btn ui-btn-light-border ui-icon-set__scope --air ui-btn-no-caps --with-left-icon ui-btn-icon-follow --style-outline ui-btn-sm ui-btn-collapsed ui-toolbar-excel-copy-button')
        .attr('title', 'Task-Daten für Excel kopieren')
        .css({
            'background-image': `url(${excelSvgBase64})`,
            'background-repeat': 'no-repeat',
            'background-position': 'center',
            'background-color': '#fff',
            'background-size': '12px 12px',
            'width': '32px',
            'height': '28px',
            'cursor': 'pointer',
            'margin-right': '0'
        })
        .bind("click", (ev) => {
            copyTaskDataToClipboard();
            ev.preventDefault();
            ev.stopPropagation();
            showCopyPopup(ev.target, "Task-Daten kopiert!");
        });

    // Buttons zur Toolbar hinzufügen
    _$(".tasks-full-card-header").append($markdownButton, $excelButton);

    // Optional: Behalte die ursprüngliche Shift+Click Funktionalität bei
    _$(".ui-toolbar-copy-link-button").bind("click", (ev) => {
        if (ev.shiftKey) {
            copyToClipboard("[" + taskId + " - " + document.title.replace(/\[.*?\]/g, "").trim() + "](" + BX.util.remove_url_param(window.location.href, ["IFRAME", "IFRAME_TYPE"]) + ")", true);
            ev.preventDefault();
            ev.stopPropagation();
            showCopyPopup(ev.target, "Markdown-Link kopiert!");
        }
    });
}

// Hilfsfunktion für Popup-Anzeige
function showCopyPopup(target, message) {
    var popupParams = {
        content: message,
        darkMode: true,
        autoHide: true,
        zIndex: 1000,
        angle: true,
        offsetLeft: 20,
        bindOptions: {
            position: 'top'
        }
    };
    var popup = new BX.PopupWindow(
        'my_tasks_clipboard_copy',
        target,
        popupParams
    );
    popup.show();
    setTimeout(function(){
        popup.close();
    }, 1500);
}

// Funktion zum Kopieren der Task-Daten (basierend auf dem Google Sheets Script)
function copyTaskDataToClipboard() {
    var sideBarFieldVals = {},
        crmFields = {},
        taskDetails = {},
        taskId = getTaskId(),
        title = (_$(".ui-toolbar-title-item").text() || _$(".task-popup-pagetitle-item").text() || "").trim(),
        hasAuftrag = _$(".field-item[data-id='D_2305'] a").length ? _$(".field-item[data-id='D_2305'] a") : null,
        auftragsLink = hasAuftrag ? "https://bitrix.mobimedia.de" + _$(".field-item[data-id='D_2305'] a").attr("href") : null;

    // Sammle alle Daten wie im ursprünglichen Script
    _$(".task-detail-sidebar-item").each(function (idx, el) {
        sideBarFieldVals[_$(el).find(".task-detail-sidebar-item-title").text().trim()] = _$(el).find(".task-detail-sidebar-item-value").text().trim();
    });

    _$(".field_crm .field_crm_entity_type").each(function (idx, el) {
        crmFields[_$(el).text().trim()] = _$(el).next().text().trim();
    });

    _$(".task-detail-property-name").each(function (idx, el) {
        taskDetails[_$(el).text().trim()] = _$(el).next().text().trim();
    });



    // Erstelle die Datenzeile (gleiche Reihenfolge wie addRow)
    var rowData = [
        `${taskId.replace(/#/, '')}`, // Aufgabennummer als Hyperlink
        `=HYPERLINK("${BX.util.remove_url_param(window.location.href, ["IFRAME", "IFRAME_TYPE"])}","${title}")`, // Titel als Hyperlink
        crmFields["Unternehmen:"] || "", // Kunde
        auftragsLink ? `=HYPERLINK("${auftragsLink}","${(crmFields['Auftrag:'] || "").replaceAll('"', '""')}")` : "", // Auftrag als Hyperlink
        (taskDetails["kalk. Std. Entwicklung"] || "0").replace(".", ","), // Stunden
        sideBarFieldVals["Erstellt:"] || sideBarFieldVals["Ende:"] || sideBarFieldVals["Frist:"] || "", // Datum
    ];

    // Konvertiere Array zu Tab-getrenntem String für Excel
    var excelData = rowData.join("\t");

    // Kopiere in die Zwischenablage
    copyToClipboard(excelData, true);
}

// Hilfsfunktion für Task-ID (aus dem ursprünglichen Script)
function getTaskId(removeHash) {
    // Most reliable: data-task-id attribute on the task card
    const dataId = _$(".tasks-full-card[data-task-id]").attr("data-task-id");
    if (dataId) {
        return removeHash ? dataId : '#' + dataId;
    }

    // Fallback: text in "ID: 12345" element
    const idText = _$(".tasks-field-created-date-id-text").text().trim();
    const idMatch = idText.match(/\d+/);
    if (idMatch && idMatch[0]) {
        return removeHash ? idMatch[0] : '#' + idMatch[0];
    }

    // Fallback: extract task ID from URL (e.g. /tasks/task/view/123/)
    const urlMatch = window.location.href.match(/\/tasks\/task\/view\/(\d+)/);
    if (urlMatch && urlMatch[1]) {
        return removeHash ? urlMatch[1] : '#' + urlMatch[1];
    }

    return "";
}

function handleTags() {
    processTags(".main-kanban-column .tasks-kanban-item-title");
    processTags(".task-popup-pagetitle-item");
    processTags("#bizproc_task_list_table a", true);
    processTags(".tasks-scrum__item--title");
    processTags("#pagetitle");
}

function processTags(selector, parentSelector) {
    _$(selector).each(function () {
        const $el = _$(this);
        const tags = extractValuesInBrackets($el.text());

        if (!tags.length || $el.find(".bsTags").length) {
            return;
        }

        const $tags = _$("<div>").addClass("bsTags");

        tags.forEach(tag => {
            $tags.append(_$("<span>").addClass(tag.toLowerCase()).text(tag));
            $el.html($el.html().replace("[" + tag + "]", tag === tags[tags.length-1] ? " " : ""));
        });

        if (parentSelector) {
            $tags.prependTo($el.parent());
        } else {
            $tags.prependTo($el);
        }
    });
}

function extractValuesInBrackets(text) {
  const regex = /\[([^\]]+)\]/g;
  const matches = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
    if (!/\[/.test(text.slice(match.index + match[0].length))) {
      break;
    }
  }

  return matches;
}

function setMenuItems() {
    const
        $menu = _$("#popup-window-content-popupMenuOptions .menu-popup-items");

    $menu.append(
        '<span class="menu-popup-item menu-popup-no-icon"><span class="menu-popup-item-icon"></span><span class="menu-popup-item-text"><b>Mobi-Features:</b></span></span>'
    );

    _$('<span class="menu-popup-item menu-popup-item-none mobi-feature mobi-feature-compact"><span class="menu-popup-item-icon"></span><span class="menu-popup-item-text">Kompakte Ansicht</span></span>')
    .attr("title", "ⓘ Blendet unwichtige Informationen bei den Karten aus und verringert die Abstände.")
    .bind("click", () => {
        _$(".mobi-feature-compact").toggleClass("active");
        window.localStorage.setItem("denseMode", _$(".mobi-feature-compact").hasClass("active") ? 1 : 0);
        updateDenseMode();
    }).toggleClass("active", useDenseMode())
    .appendTo($menu);

    _$('<span class="menu-popup-item menu-popup-item-none mobi-feature mobi-feature-nopic"><span class="menu-popup-item-icon"></span><span class="menu-popup-item-text">Bilder anzeigen</span></span>')
    .attr("title", "ⓘ Bilder bei den Karten anzeigen?")
    .bind("click", () => {
        _$(".mobi-feature-nopic").toggleClass("active");
        window.localStorage.setItem("showPics", _$(".mobi-feature-nopic").hasClass("active") ? 1 : 0);
        updateShowPics();
    }).toggleClass("active", showPics())
    .appendTo($menu);

    _$('<span class="menu-popup-item menu-popup-item-none mobi-feature mobi-feature-hide"><span class="menu-popup-item-icon"></span><span class="menu-popup-item-text">Ausgeblendete Spalten anzeigen</span></span>')
    .attr("title", "ⓘ Spalten können durch ein [hide] im Titel ausgeblendet werden.")
    .bind("click", () => {
        _$(".mobi-feature-hide").toggleClass("active");
        window.localStorage.setItem("showMode", _$(".mobi-feature-hide").hasClass("active") ? 1 : 0);
        prepareColumns();
    }).toggleClass("active", showMode())
    .appendTo($menu);

    _$('<span class="menu-popup-item menu-popup-item-none mobi-feature mobi-feature-calc"><span class="menu-popup-item-icon"></span><span class="menu-popup-item-text">Stundensummierung (Story Points)</span></span>')
    .attr("title", "ⓘ Summierung der Story Points bei den einzelnen Spalten. Tipp: [nocalc] im Titel deaktiviert die Berechnung für einzelne Spalten.")
    .bind("click", () => {
        _$(".mobi-feature-calc").toggleClass("active");
        window.localStorage.setItem("calcMode", _$(".mobi-feature-calc").hasClass("active") ? 1 : 0);
        updateCalcMode();
    }).toggleClass("active", useCalc())
    .appendTo($menu);
}

function updateShowPics() {
    _$(".main-kanban").toggleClass("noPicMode", !showPics());
}

function showPics() {
    return window.localStorage.getItem("showPics") === "1";
}

function useCalc() {
    return window.localStorage.getItem("calcMode") === "1";
}

function useDenseMode() {
    return window.localStorage.getItem("denseMode") === "1";
}

function showMode() {
    return window.localStorage.getItem("showMode") === "1";
}

function updateCalcMode() {
    if (useCalc()) {
        bxSumsInit();
        prepareSprints();
    } else {
        _$(".main-kanban-column-body").removeClass("calculated");
        _$(".tasks-scrum__content-container").removeClass("sprint-calculated");
        _$(".customBxSums").detach();
    }
}

function updateDenseMode() {
    _$(".main-kanban").toggleClass("denseMode", useDenseMode());
}

function useSettings() {
    prepareColumns();
    updateDenseMode();
    updateCalcMode();
    updateShowPics();
    prepareSprints(); // Sprint-Ansicht vorbereiten
}

function prepareColumns() {
    handleTags();
    _$(".main-kanban-column-title-text-inner").each((idx, title) => {
        const $col = _$(title).parents(".main-kanban-column");

        if (_$(title).text().trim() === "[spacer]") {
            $col.addClass("kanban-spacer");
        } else {
            $col.removeClass("kanban-spacer");
        }

        if (_$(title).text().trim().indexOf("[hide]") >=0 && !showMode()) {
            $col.addClass("hide");
        } else {
            $col.removeClass("hide");
        }

        $col.find(".main-kanban-column-title-input-edit").not(".changeHandled").change(() => {
            $col.find(".main-kanban-column-body").removeClass("calculated");
            window.setTimeout(prepareColumns, 200);
            window.setTimeout(calculateVisibles, 200);
        }).addClass("changeHandled");
    });
    calculateVisibles();
}

function copyToClipboard(str, hideAlert) {
    var $cpTextarea = _$("<textarea>")
        .attr("id", "copyTmpTextarea")
        .css({
            position: 'absolute',
            left: '-99999px'
        })
        .appendTo(document.body);
    $cpTextarea.val(str).get(0).select();
    document.execCommand("copy");
    if (!hideAlert) {
        alert("Folgender Text wurde in die Zwischenablage kopiert: \n" + str);
    }
    $cpTextarea.detach();
}

function bxSumsInit() {
    if (!cssLoaded()) {
        window.setTimeout(bxSumsInit, 200);
    } else {
        onCssLoaded();
    }
}

function onCssLoaded() {
    var
        $container = _$(".main-kanban-grid");

    calculateVisibles();

    $container.unbind("scroll");
    $container.bind("scroll", _.debounce(calculateVisibles, 50));

    // Globaler Event-Handler für Spalten-Aktualisierung bei Drag&Drop
    if (typeof BX !== 'undefined' && !window._bxSumsKanbanEventRegistered) {
        window._bxSumsKanbanEventRegistered = true;
        BX.addCustomEvent("Kanban.Column:render", _.debounce(function () {
            // Bei Verschiebung müssen ALLE sichtbaren Spalten neu berechnet werden
            _$(".main-kanban-column-body").removeClass("calculated");
            calculateVisibles();
            _.delay(prepareColumns, 200);
        }, 100));
    }

    // Beobachte das Schließen von Aufgaben (SidePanel Events)
    setupTaskCloseObserver();

    // Beobachte Sprint-Änderungen
    if (_$(".tasks-scrum__sprints").length) {
        var lastTaskCount = {};

        var sprintObserver = new MutationObserver(_.debounce(function() {
            // Prüfe ob sich die Anzahl der Tasks geändert hat
            var changed = false;
            _$(".tasks-scrum__content").each(function() {
                var $sprint = _$(this);
                var sprintId = $sprint.attr("data-sprint-id");
                if (sprintId) {
                    var currentCount = $sprint.find(".tasks-scrum__item").length;
                    if (!lastTaskCount[sprintId] || lastTaskCount[sprintId] !== currentCount) {
                        lastTaskCount[sprintId] = currentCount;
                        changed = true;
                    }
                }
            });

            prepareSprints();
        }, 500));

        _$(".tasks-scrum__sprints").each(function() {
            sprintObserver.observe(this, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        });

        // Initiale Berechnung nach kurzer Verzögerung
        setTimeout(function() {
            prepareSprints();
        }, 1000);
    }

    // Beobachte Backlog-Änderungen
    if (_$(".tasks-scrum__backlog").length) {
        var backlogObserver = new MutationObserver(_.debounce(function() {
            prepareSprints();
        }, 200));

        _$(".tasks-scrum__backlog").each(function() {
            backlogObserver.observe(this, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        });
    }
}

function setupTaskCloseObserver() {
    // Beobachte das Schließen von Aufgaben mit BX.SidePanel Events
    if (typeof BX !== 'undefined' && BX.SidePanel) {
        BX.addCustomEvent("SidePanel.Slider:onClose", function(event) {
            // Hole Task-ID aus der URL des SidePanels
            var taskId = null;
            if (event && event.getSlider) {
                var slider = event.getSlider();
                if (slider && slider.getUrl) {
                    var url = slider.getUrl();
                    // Extrahiere Task-ID aus URL wie /company/personal/user/123/tasks/task/view/456/
                    var match = url.match(/\/tasks\/task\/view\/(\d+)/);
                    if (match && match[1]) {
                        taskId = parseInt(match[1]);
                    }
                }
            }

            // Wenn wir eine Task-ID haben, hole die aktuellen Tags per API
            if (taskId) {
                fetchTaskDataAndUpdate(taskId);
            }

            // Minimale Verzögerung (50ms) um sicherzustellen dass DOM stabil ist
            _.delay(function() {
                // Entferne calculated-Flags von ALLEN Spalten
                _$(".main-kanban-column-body").removeClass("calculated");

                calculateVisibles();
                prepareSprints();
            }, 50);
        });

        BX.addCustomEvent("SidePanel.Slider:onCloseComplete", function(event) {
            // Sofort ohne Verzögerung
            _$(".main-kanban-column-body").removeClass("calculated");
            calculateVisibles();
            prepareSprints();
        });

    }

    // Watch for task panel appearing in DOM (more reliable than SidePanel events)
    var taskPanelObserver = new MutationObserver(function() {
        if (_$(".tasks-full-card-header").length && !_$(".ui-toolbar-markdown-copy-button").length) {
            handleTaskLinkCopy();
        }
    });
    taskPanelObserver.observe(document.body, { childList: true, subtree: true });
}

function fetchTaskDataAndUpdate(taskId) {
    // Rufe Task-Daten per Bitrix REST API ab
    if (typeof BX === 'undefined' || !BX.ajax) {
        triggerRecalculation();
        return;
    }

    BX.ajax.runAction('tasks.task.get', {
        data: {
            taskId: taskId,
            select: ['ID', 'TAGS']
        }
    }).then(function(response) {
        if (response && response.data && response.data.task) {
            var task = response.data.task;
            var tagsRaw = task.tags || {};

            // Konvertiere Tags-Objekt in Array von Tag-Namen
            var tags = [];
            if (Array.isArray(tagsRaw)) {
                tags = tagsRaw;
            } else if (typeof tagsRaw === 'object' && tagsRaw !== null) {
                // Objekt mit Tag-IDs als Keys
                for (var tagId in tagsRaw) {
                    if (tagsRaw.hasOwnProperty(tagId)) {
                        var tagObj = tagsRaw[tagId];

                        // Versuche verschiedene Formate
                        if (typeof tagObj === 'string') {
                            tags.push(tagObj);
                        } else if (tagObj && tagObj.name) {
                            tags.push(tagObj.name);
                        } else if (tagObj && tagObj.NAME) {
                            tags.push(tagObj.NAME);
                        } else if (tagObj && typeof tagObj === 'object') {
                            // Versuche den ersten String-Wert zu nehmen
                            for (var key in tagObj) {
                                if (typeof tagObj[key] === 'string' && tagObj[key].length > 0) {
                                    tags.push(tagObj[key]);
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // Aktualisiere das Kanban-Objekt, falls vorhanden
            updateKanbanObjectTags(taskId, tags);

            // Warte etwas länger, bis DOM stabil ist, dann aktualisiere
            _.delay(function() {
                updateTaskTagsInDOM(taskId, tags);
                updateTaskTagsInScrum(taskId, tags);
                triggerRecalculation();
            }, 300);
        } else {
            triggerRecalculation();
        }
    }).catch(function(error) {
        triggerRecalculation();
    });
}

function updateKanbanObjectTags(taskId, tags) {
    // WICHTIG: Wir müssen IMMER aktualisieren, auch wenn tags leer ist!
    // Ein leeres Array bedeutet "Tags wurden entfernt", nicht "nichts tun"

    // Aktualisiere das Kanban-Objekt direkt, falls vorhanden
    if (typeof Kanban !== 'undefined' && Kanban.columns) {
        // Finde die Task im Kanban-Objekt
        for (var columnId in Kanban.columns) {
            var column = Kanban.columns[columnId];
            if (column && column.items) {
                for (var i = 0; i < column.items.length; i++) {
                    var item = column.items[i];
                    if (item && item.data && item.data.id == taskId) {
                        // WICHTIG: Aktualisiere IMMER, auch wenn leer!
                        // Leeres Array = Tags wurden entfernt
                        item.data.tags = tags || [];
                        return;
                    }
                }
            }
        }
    }
}

function triggerRecalculation() {
    // Entferne ALLE calculated-Flags sofort
    _$(".main-kanban-column-body").removeClass("calculated");
    _$(".tasks-scrum__content-container").removeClass("sprint-calculated");
    _$(".tasks-scrum__content-items").removeClass("backlog-calculated");

    // Warte kurz, dann verarbeite Tags und rechne neu
    _.delay(function() {
        // Tags verarbeiten
        handleTags();

        // Neuberechnung durchführen
        calculateVisibles();
        prepareSprints();
    }, 200);
}

function updateTaskTagsInDOM(taskId, tags) {
    // Finde die Karte im Kanban-Board
    var $item = _$('.main-kanban-item[data-item-id="' + taskId + '"]');
    if (!$item.length) {
        return;
    }

    // Entferne alte Tag-Elemente
    var $tagsContainer = $item.find('.tasks-kanban-item-tags');
    if ($tagsContainer.length) {
        // WICHTIG: Leere den Container komplett (auch wenn keine neuen Tags kommen)
        $tagsContainer.empty();

        // Füge neue Tags hinzu (nur wenn vorhanden)
        if (tags && tags.length > 0) {
            tags.forEach(function(tag) {
                var $tag = _$('<span class="ui-label ui-label-sm ui-label-light">' +
                    '<span class="ui-label-inner">' + tag + '</span>' +
                    '</span>');
                $tagsContainer.append($tag);
            });
        }
    } else {
        // Falls kein Tag-Container existiert, erstelle einen
        var $kanbanItem = $item.find('.tasks-kanban-item');
        if ($kanbanItem.length && tags && tags.length > 0) {
            $tagsContainer = _$('<div class="tasks-kanban-item-tags"></div>');
            tags.forEach(function(tag) {
                var $tag = _$('<span class="ui-label ui-label-sm ui-label-light">' +
                    '<span class="ui-label-inner">' + tag + '</span>' +
                    '</span>');
                $tagsContainer.append($tag);
            });
            $kanbanItem.append($tagsContainer);
        }
    }
}

function updateTaskTagsInScrum(taskId, tags) {
    // Finde die Task in der Scrum/Sprint-Ansicht
    var $item = _$('.tasks-scrum__item[data-id="' + taskId + '"]');
    if (!$item.length) {
        return;
    }

    // Entferne alte Tags und füge neue hinzu
    var $hashtagEl = $item.find('.tasks-scrum__item--hashtag');
    if ($hashtagEl.length && tags && tags.length) {
        // Suche nach Rest-Tag
        var restTag = null;
        tags.forEach(function(tag) {
            var cleanTag = tag.replace(/^#/, '');
            if (cleanTag.match(/^Rest\s*:?\s*([\d.,]+)\s*?$/i)) {
                restTag = tag;
            }
        });

        if (restTag) {
            $hashtagEl.text(restTag);
        }
    }
}

function calculateVisibles() {
    if (!useCalc()) {
        return;
    }

    var
        $container = _$(".main-kanban-grid");

    var $allColumns = _$(".main-kanban-column-body");
    var $notCalculated = $allColumns.not(".calculated");

    $notCalculated.each(function () {
        var
            $this = _$(this),
            $parent = $this.parent(),
            left = $parent.position().left,
            title = $parent.find(".main-kanban-column-title-text-inner").text() || "";

        if (title.indexOf("[nocalc]") >= 0 || (title.indexOf("[hide]") >= 0 && !showMode())) {
            $this.removeClass("calculated")
            $parent.find(".customBxSums").detach();
        } else {
            // Im Sichtbereich?
            if (!$this.hasClass("calculated") && left > ($this.width() * -1) && left < $container.width()) {
                var stageId = $this.attr("data-id");
                calculateFromDOM($this, stageId, true);
                $this.addClass("calculated");

                // Versuche auch mit Kanban-Objekt, falls vorhanden
                if (typeof Kanban !== 'undefined' && Kanban.columns && Kanban.columns[stageId]) {
                    loadAllItems($this, Kanban.columns[stageId]);
                }
            }
        }
    });
}

function calculateFromDOM($list, stageId, addEventHandler, skipHandleTags) {
    var
        $parent = $list.parent(),
        $bxSums = $parent.find(".customBxSums"),
        $title = $parent.find(".main-kanban-column-title-text-inner"),
        titleBg = $parent.find(".main-kanban-column-title-bg").css("background-color"),
        titleColor = $title.css("color");

    // Fallback für Sprint-Planning-Spalten ohne eigenen Header
    if (!titleBg || titleBg === "rgba(0, 0, 0, 0)" || titleBg === "transparent" || !$title.length) {
        // Suche die entsprechende Spalte im vorherigen main-kanban Container über den Index
        var $mainKanban = $parent.closest(".main-kanban");
        var $prevKanban = $mainKanban.prev(".main-kanban");

        if ($prevKanban.length) {
            // Finde den Index der aktuellen Spalte im unteren Grid
            var $allColumnsInCurrentGrid = $mainKanban.find(".main-kanban-column");
            var columnIndex = $allColumnsInCurrentGrid.index($parent);

            // Hole die entsprechende Spalte im oberen Grid (gleicher Index)
            var $correspondingColumn = $prevKanban.find(".main-kanban-column").eq(columnIndex);

            if ($correspondingColumn.length) {
                titleBg = $correspondingColumn.find(".main-kanban-column-title-bg").css("background-color");
                titleColor = $correspondingColumn.find(".main-kanban-column-title-text-inner").css("color");
            }
        }

        // Wenn immer noch keine Farbe gefunden wurde, verwende Standardwerte
        if (!titleBg || titleBg === "rgba(0, 0, 0, 0)" || titleBg === "transparent") {
            titleBg = "#949da9";
        }
        if (!titleColor || titleColor === "rgba(0, 0, 0, 0)") {
            titleColor = "#000";
        }
    }

    var
        column = (typeof Kanban !== 'undefined' && Kanban.columns && Kanban.columns[stageId]) ? Kanban.columns[stageId] : null,
        tasks = column ? column.items : [],
        $items = $list.find(".main-kanban-item"),
        estimations = {},
        spent = {},
        rest = {},
        responsibles = {},
        totalRest = 0,
        totalSpent = 0,
        totalEstimated = 0,
        useStoryPoints = false;

    if ($title.text().indexOf("[nocalc]") >= 0) {
        return;
    }

    if (!skipHandleTags) {
        handleTags();
    }

    // Wenn Kanban-Objekt verfügbar ist, verwende es (bevorzugt)
    if (tasks && tasks.length) {
        for (var i = 0; i < tasks.length; i++) {
            var
                task = tasks[i],
                data = task.data,
                responsibleId = data.responsible && data.responsible.id || "",
                responsibleData = data.responsible,
                tags = data.tags,
                curSpent = parseInt(data.time_logs || 0),
                estimated = parseInt(data.time_estimate || 0),
                curRest = estimated,
                points = 0,
                pointsRest = 0,
                itemUsesStoryPoints = false;

            // Prüfe ob Story Points verwendet werden sollen
            var $item = _$($items[i]);
            var $storyPointsEl = $item.find(".tasks-kanban-item-story-points");
            if ($storyPointsEl.length && $storyPointsEl.text().trim()) {
                points = parseFloat($storyPointsEl.text().trim()) || 0;
                pointsRest = points; // Default: Rest = Story Points
                itemUsesStoryPoints = (points > 0);
                if (itemUsesStoryPoints) {
                    useStoryPoints = true;
                }
            }

            // Wenn Story Points vorhanden sind, verwende diese
            // Andernfalls verwende die Original-Zeiterfassung
            if (!itemUsesStoryPoints && estimated > 0) {
                // Original-Logik für Zeiterfassung
                curRest = estimated;

                // Rest aus Tags ermitteln
                if (tags && tags.length) {
                    _.each(tags, function (tag) {
                        var match = tag.match(/^Rest.*?([\d.,]+)\s*?$/);
                        if (match && match.length > 1) {
                            curRest = timeStrToSeconds(match[1]);
                        }
                    });
                }

                responsibles[responsibleId] = responsibleData;

                if (!spent[responsibleId]) {
                    spent[responsibleId] = 0;
                }

                if (!estimations[responsibleId]) {
                    estimations[responsibleId] = 0;
                }

                if (!rest[responsibleId]) {
                    rest[responsibleId] = 0;
                }

                spent[responsibleId] += curSpent;
                estimations[responsibleId] += estimated;
                rest[responsibleId] += curRest;

                totalSpent += curSpent;
                totalRest += curRest;
                totalEstimated += estimated;
            } else if (itemUsesStoryPoints) {
                // Neue Logik für Story Points
                // Rest aus Tags ermitteln (aus JavaScript-Objekt)
                if (tags && tags.length) {
                    _.each(tags, function (tag) {
                        var cleanTag = tag.replace(/^#/, '');
                        var match = cleanTag.match(/^Rest\s*:?\s*([\d.,]+)\s*?$/i);
                        if (match && match.length > 1) {
                            pointsRest = parseFloat(match[1].replace(',', '.')) || 0;
                        }
                    });
                }

                // Falls keine Tags im JS-Objekt, versuche aus DOM zu lesen
                if ((!tags || !tags.length) && points > 0) {
                    var $tagsEl = $item.find(".tasks-kanban-item-tags .ui-label-inner");
                    if ($tagsEl.length) {
                        $tagsEl.each(function() {
                            var tagText = _$(this).text().trim();
                            var cleanTag = tagText.replace(/^#/, '');
                            var match = cleanTag.match(/^Rest\s*:?\s*([\d.,]+)\s*?$/i);
                            if (match && match.length > 1) {
                                pointsRest = parseFloat(match[1].replace(',', '.')) || 0;
                            }
                        });
                    }
                }

                responsibles[responsibleId] = responsibleData;

                if (!spent[responsibleId]) {
                    spent[responsibleId] = 0;
                }

                if (!estimations[responsibleId]) {
                    estimations[responsibleId] = 0;
                }

                if (!rest[responsibleId]) {
                    rest[responsibleId] = 0;
                }

                // Bei Story Points: Spent = Estimated - Rest
                var pointsSpent = points - pointsRest;

                spent[responsibleId] += pointsSpent;
                estimations[responsibleId] += points;
                rest[responsibleId] += pointsRest;

                totalSpent += pointsSpent;
                totalEstimated += points;
                totalRest += pointsRest;
            }
        }
    } else {
        // Fallback: Nur aus DOM lesen (wenn Kanban-Objekt nicht verfügbar)
        if (!$items.length) {
            $bxSums.detach();
            return;
        }

        $items.each(function() {
            var
                $item = _$(this),
                $kanbanItem = $item.find(".tasks-kanban-item"),
                $storyPointsEl = $kanbanItem.find(".tasks-kanban-item-story-points"),
                $responsibleEl = $kanbanItem.find(".tasks-kanban-item-responsible-sprint .tasks-kanban-item-author-avatar, .tasks-kanban-item-responsible .tasks-kanban-item-author-avatar"),
                $titleEl = $kanbanItem.find(".tasks-kanban-item-title"),
                $tagsEl = $kanbanItem.find(".tasks-kanban-item-tags .ui-label-inner"),
                responsibleName = $responsibleEl.attr("title") || "Unbekannt",
                responsibleImg = $responsibleEl.css("background-image"),
                points = 0,
                pointsRest = 0;

            // Lese Story Points
            if ($storyPointsEl.length) {
                var pointsText = $storyPointsEl.text().trim();
                points = parseFloat(pointsText) || 0;
                pointsRest = points; // Default: Rest = Story Points
                if (points > 0) {
                    useStoryPoints = true;
                }
            }

            // Suche nach Rest-Tags im Titel und in Tags
            var titleText = $titleEl.text();
            var allTags = extractValuesInBrackets(titleText);

            // Lese auch Tags aus DOM
            if ($tagsEl.length) {
                $tagsEl.each(function() {
                    var tagText = _$(this).text().trim();
                    allTags.push(tagText);
                });
            }

            if (allTags && allTags.length) {
                _.each(allTags, function (tag) {
                    // Entferne # am Anfang falls vorhanden
                    var cleanTag = tag.replace(/^#/, '');
                    var match = cleanTag.match(/^Rest\s*:?\s*([\d.,]+)\s*?$/i);
                    if (match && match.length > 1) {
                        pointsRest = parseFloat(match[1].replace(',', '.')) || 0;
                    }
                });
            }

            if (points > 0) {
                if (!spent[responsibleName]) {
                    spent[responsibleName] = 0;
                }

                if (!estimations[responsibleName]) {
                    estimations[responsibleName] = 0;
                }

                if (!rest[responsibleName]) {
                    rest[responsibleName] = 0;
                }

                responsibles[responsibleName] = {
                    name: responsibleName,
                    photo: responsibleImg
                };

                // Bei Story Points: Spent = Estimated - Rest
                var pointsSpent = points - pointsRest;

                spent[responsibleName] += pointsSpent;
                estimations[responsibleName] += points;
                rest[responsibleName] += pointsRest;

                totalSpent += pointsSpent;
                totalEstimated += points;
                totalRest += pointsRest;
            }
        });
    }

    // Erstelle oder aktualisiere die Anzeige
    if (totalEstimated > 0) {
        if (!$bxSums.length) {
            $bxSums = _$("<ul>")
                .addClass("customBxSums");
            $list.before($bxSums);
        }
        $bxSums.empty().hide();

        // Zeige Stunden/Story Points pro Verantwortlichem
        for (var id in responsibles) {
            var
                r = responsibles[id] || {},
                name = r.name || id,
                icon = r.photo && r.photo.src ? "url('" + r.photo.src + "')" : r.photo;

            if (estimations[id] > 0) {
                _$("<li>")
                    .addClass("uSum")
                    .data("name", name)
                    .css("display", "flex")
                    .append(
                        _$("<div>")
                            .attr("title", name)
                            .addClass("tasks-kanban-item-author-avatar")
                            .css("background-image", icon || "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2040%2040%22%3E%0A%20%20%20%20%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%2220%22%20fill%3D%22%23525C68%22/%3E%0A%20%20%20%20%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M30.4364902%2C31.4100231%20C30.4364902%2C29.9871769%2028.8398242%2C23.9680557%2028.8398242%2C23.9680557%20C28.8398242%2C23.0883414%2027.6898708%2C22.083459%2025.4253473%2C21.4978674%20C24.6581347%2C21.2838747%2023.9288072%2C20.9520366%2023.2634349%2C20.514215%20C23.1179216%2C20.4310645%2023.1400361%2C19.6628072%2023.1400361%2C19.6628072%20L22.4107003%2C19.5517925%20C22.4107003%2C19.4894296%2022.3483374%2C18.5681401%2022.3483374%2C18.5681401%20C23.2209751%2C18.274902%2023.1311903%2C16.5451067%2023.1311903%2C16.5451067%20C23.6853794%2C16.8524981%2024.0462878%2C15.4836113%2024.0462878%2C15.4836113%20C24.7017612%2C13.5817654%2023.719878%2C13.6967607%2023.719878%2C13.6967607%20C23.8916546%2C12.5357299%2023.8916546%2C11.3557413%2023.719878%2C10.1947105%20C23.283338%2C6.34325128%2016.7109122%2C7.38882426%2017.4902268%2C8.64669632%20C15.5693624%2C8.29286451%2016.0076715%2C12.6635719%2016.0076715%2C12.6635719%20L16.4243085%2C13.7953913%20C15.6060724%2C14.326139%2016.1748571%2C14.9679015%2016.2031636%2C15.7065254%20C16.243412%2C16.7972119%2016.9108272%2C16.5712018%2016.9108272%2C16.5712018%20C16.9519602%2C18.3713211%2017.8396357%2C18.6057347%2017.8396357%2C18.6057347%20C18.0063789%2C19.7362273%2017.9024408%2C19.5438313%2017.9024408%2C19.5438313%20L17.1125113%2C19.6393659%20C17.1232047%2C19.896452%2017.1022601%2C20.1538778%2017.0501485%2C20.405854%20C16.12134%2C20.8198372%2015.921425%2C21.0626543%2014.9983663%2C21.4673494%20C13.215054%2C22.2488754%2011.2769403%2C23.2652573%2010.9323966%2C24.6337018%20C10.5878529%2C26.0021463%209.56350982%2C31.4100231%209.56350982%2C31.4100231%20L30.4356056%2C31.4100231%20L30.4356056%2C31.4100231%20L30.4356056%2C31.4100231%20L30.4364902%2C31.4100231%20Z%22/%3E%0A%3C/svg%3E%0A')")
                    )
                    .bind("click", function () {
                        filterResponsible(_$(this));
                    })
                    .toggleClass("filtered", $parent.attr("rel") === name)
                    .append(
                        _$("<div>").text(
                            // Unterscheide basierend auf useStoryPoints, nicht auf der Größe der Zahl
                            (useStoryPoints ? formatStoryPoints(spent[id]) + "h" : formatTime(spent[id])) + " / " +
                            (useStoryPoints ? formatStoryPoints(estimations[id]) + "h" : formatTime(estimations[id])) +
                            (rest[id] ? (" (Rest: " + (useStoryPoints ? formatStoryPoints(rest[id]) + "h" : formatTime(rest[id])) + ")") : "")
                        )
                    ).appendTo($bxSums);
            }
        }

        if (totalEstimated > 0) {
            _$("<li>")
                .addClass("totals")
                .css("background-color", titleBg)
                .css("color", titleColor)
                .bind("click", function () {
                    filterResponsible(_$(this), null);
                })
            .append(
                _$("<div>")
                .html('<svg viewBox="0 0 24 24"><path fill="' + titleColor + '" d="M12,6A3,3 0 0,0 9,9A3,3 0 0,0 12,12A3,3 0 0,0 15,9A3,3 0 0,0 12,6M6,8.17A2.5,2.5 0 0,0 3.5,10.67A2.5,2.5 0 0,0 6,13.17C6.88,13.17 7.65,12.71 8.09,12.03C7.42,11.18 7,10.15 7,9C7,8.8 7,8.6 7.04,8.4C6.72,8.25 6.37,8.17 6,8.17M18,8.17C17.63,8.17 17.28,8.25 16.96,8.4C17,8.6 17,8.8 17,9C17,10.15 16.58,11.18 15.91,12.03C16.35,12.71 17.12,13.17 18,13.17A2.5,2.5 0 0,0 20.5,10.67A2.5,2.5 0 0,0 18,8.17M12,14C10,14 6,15 6,17V19H18V17C18,15 14,14 12,14M4.67,14.97C3,15.26 1,16.04 1,17.33V19H4V17C4,16.22 4.29,15.53 4.67,14.97M19.33,14.97C19.71,15.53 20,16.22 20,17V19H23V17.33C23,16.04 21,15.26 19.33,14.97Z" /></svg>')
            ).append(
                _$("<div>").text(
                    (useStoryPoints ? formatStoryPoints(totalSpent) + "h" : formatTime(totalSpent)) + " / " +
                    (useStoryPoints ? formatStoryPoints(totalEstimated) + "h" : formatTime(totalEstimated))
                    + (totalRest ? " (Rest: " + (useStoryPoints ? formatStoryPoints(totalRest) + "h" : formatTime(totalRest)) + ")" : "")
                )
            ).appendTo($bxSums);
            _$("<div>").addClass("triangle").css("border-right", "8px solid " + titleBg).appendTo($bxSums);
            _$("<div>").addClass("band").css("background-color", titleBg).appendTo($bxSums);
            _$("<div>").addClass("triangleR").css("border-left", "8px solid " + titleBg).appendTo($bxSums);
            _$("<div>").addClass("bandR").css("background-color", titleBg).appendTo($bxSums);
            $bxSums.show();
        }
    } else {
        $bxSums.detach();
    }
}

function filterResponsible ($li) {
    var
        $column = $li.parents(".main-kanban-column, .tasks-scrum__content"),
        $items = $column.find(".main-kanban-item, .tasks-scrum__item"),
        responsible = $li.data("name"),
        newFilter = responsible || false;

    if ($li.hasClass("filtered")) {
        newFilter = false;
    }
    $items.each(function () {
        var $responsibleEl = _$(this).find(".tasks-kanban-item-responsible-sprint .tasks-kanban-item-author-avatar, .tasks-kanban-item-responsible .tasks-kanban-item-author-avatar, .tasks-scrum__item--responsible span");
        var itemResponsible = $responsibleEl.attr("title") || $responsibleEl.text().trim();
        _$(this).toggle(
            !newFilter || responsible === itemResponsible
        );
    });
    $column.find(".customBxSums li").removeClass("filtered");
    $li.toggleClass("filtered", !!newFilter);
    $column.attr("rel", newFilter);
}

function cssLoaded() {
    if (!_$("#bxSumsLink").length) {
        return false;
    }
    return Boolean(_$("#bxSumsLink").get(0).sheet);
}

function formatStoryPoints(points) {
    if (!points || points <= 0) {
        return "0";
    }
    // Formatiere mit Komma als Dezimaltrennzeichen
    return points.toString().replace('.', ',');
}

function formatTime (totalSeconds) {
    var
        hours = totalSeconds > 0 ? Math.floor(totalSeconds / 3600) : Math.ceil(totalSeconds / 3600),
        totSeconds = totalSeconds % 3600,
        minutes = Math.round(Math.abs(Math.floor(totSeconds / 60) / 6 * 10), 0),
        seconds = totSeconds % 60;

    if (!totalSeconds || totalSeconds < 0) {
        return "0h";
    }
    return (hours + "," + (minutes < 10 ? "0" + minutes : minutes) + "h").replace(/(,00h|0h)$/, "h");
}

function timeStrToSeconds (timeStr) {
    var
        splitted = timeStr.split(/[.,]/);

    if (splitted.length === 1) {
        return parseInt(splitted[0]) * 3600;
    } else if (splitted.length === 2 && parseInt(splitted[1]) > 0) {
        return parseInt(splitted[0]) * 3600
            + 60 / 10 * parseInt(splitted[1]) * 60;
    }

    return 0;
}

function loadAllItems($col, column) {
    var
      pagination = column.getPagination(),
      columnId = column.id;

    // Wenn sich die Anzahl der Items nach maxLoadingSecondsPerColumn nicht veraendert, gehen wir davon aus dass es keine weiteren Items mehr zu laden gibt...
    if (loadingPagesCount[columnId] && (Date.now() / 1000) - loadingPagesCount[columnId].start > maxLoadingSecondsPerColumn && column.getItemsCount() === loadingPagesCount[columnId].items) {
        return;
    }

    if (column.hasLoading()) {
        if (!pagination.loadingInProgress) {
            if (!loadingPagesCount[columnId]) {
                loadingPagesCount[columnId] = {
                    start: Date.now() / 1000,
                    items: column.getItemsCount()
                };
            }
            pagination.loadItems();
        }

        _.delay(function () {
            loadAllItems($col, column);
        }, 100);
    }
}

// Sprint-Ansicht Funktionen
function prepareSprints() {
    if (!useCalc()) {
        return;
    }

    // Sprints berechnen
    _$(".tasks-scrum__sprints .tasks-scrum__content").each(function() {
        var $sprint = _$(this);
        var $container = $sprint.find(".tasks-scrum__content-container");

        if ($container.length && !$container.hasClass("sprint-calculated")) {
            calculateSprintFromDOM($sprint);
            $container.addClass("sprint-calculated");

            // Füge MutationObserver hinzu um bei neuen Tasks neu zu berechnen
            setupSprintObserver($sprint);
        }
    });

    // Backlog berechnen
    _$(".tasks-scrum__backlog .tasks-scrum__content").each(function() {
        var $backlog = _$(this);
        var $items = $backlog.find(".tasks-scrum__content-items");

        if ($items.length && !$items.hasClass("backlog-calculated")) {
            calculateBacklogFromDOM($backlog);
            $items.addClass("backlog-calculated");

            // Füge Scroll-Listener hinzu um Tags bei Scroll nachzuführen
            setupBacklogScrollObserver($backlog);
        }
    });
}

function calculateBacklogFromDOM($backlog, skipHandleTags) {
    // Verarbeite Tags für neu geladene Aufgaben
    if (!skipHandleTags) {
        handleTags();
    }

    var
        $bxSums = $backlog.find(".customBxSums"),
        $header = $backlog.find(".tasks-scrum__content-header"),
        $items = $backlog.find(".tasks-scrum__item"),
        taskCounts = {},
        responsibles = {},
        totalTasks = 0;

    if (!$items.length) {
        $bxSums.detach();
        return;
    }

    // Zähle Aufgaben pro Verantwortlichem
    $items.each(function() {
        var
            $item = _$(this),
            $responsibleEl = $item.find(".tasks-scrum__item--responsible span"),
            $responsiblePhotoEl = $item.find(".tasks-scrum__item--responsible-photo i"),
            responsibleName = $responsibleEl.text().trim() || "Unbekannt",
            responsibleImg = $responsiblePhotoEl.css("background-image");

        if (!taskCounts[responsibleName]) {
            taskCounts[responsibleName] = 0;
        }

        responsibles[responsibleName] = {
            name: responsibleName,
            photo: responsibleImg
        };

        taskCounts[responsibleName] += 1;
        totalTasks += 1;
    });

    // Erstelle oder aktualisiere die Anzeige
    if (totalTasks > 0) {
        if (!$bxSums.length) {
            $bxSums = _$("<ul>")
                .addClass("customBxSums customBxSums-backlog")
                .css({
                    'list-style': 'none',
                    'padding': '6px 10px',
                    'margin': '0 0 6px 0',
                    'background': '#fff',
                    'border-radius': '4px',
                    'box-shadow': '0 1px 2px rgba(0,0,0,0.08)'
                });
            $header.after($bxSums);
        }
        $bxSums.empty();

        // Zeige Aufgaben pro Verantwortlichem
        for (var name in responsibles) {
            var
                r = responsibles[name] || {},
                icon = r.photo;

            if (taskCounts[name] > 0) {
                _$("<li>")
                    .addClass("uSum")
                    .data("name", name)
                    .css({
                        'display': 'flex',
                        'align-items': 'center',
                        'gap': '6px',
                        'padding': '3px 0',
                        'font-size': '12px',
                        'cursor': 'pointer'
                    })
                    .append(
                        _$("<div>")
                            .attr("title", name)
                            .addClass("tasks-kanban-item-author-avatar")
                            .css({
                                'width': '20px',
                                'height': '20px',
                                'border-radius': '50%',
                                'background-size': 'cover',
                                'background-position': 'center',
                                'flex-shrink': '0',
                                'background-image': icon || "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2040%2040%22%3E%0A%20%20%20%20%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%2220%22%20fill%3D%22%23525C68%22/%3E%0A%20%20%20%20%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M30.4364902%2C31.4100231%20C30.4364902%2C29.9871769%2028.8398242%2C23.9680557%2028.8398242%2C23.9680557%20C28.8398242%2C23.0883414%2027.6898708%2C22.083459%2025.4253473%2C21.4978674%20C24.6581347%2C21.2838747%2023.9288072%2C20.9520366%2023.2634349%2C20.514215%20C23.1179216%2C20.4310645%2023.1400361%2C19.6628072%2023.1400361%2C19.6628072%20L22.4107003%2C19.5517925%20C22.4107003%2C19.4894296%2022.3483374%2C18.5681401%2022.3483374%2C18.5681401%20C23.2209751%2C18.274902%2023.1311903%2C16.5451067%2023.1311903%2C16.5451067%20C23.6853794%2C16.8524981%2024.0462878%2C15.4836113%2024.0462878%2C15.4836113%20C24.7017612%2C13.5817654%2023.719878%2C13.6967607%2023.719878%2C13.6967607%20C23.8916546%2C12.5357299%2023.8916546%2C11.3557413%2023.719878%2C10.1947105%20C23.283338%2C6.34325128%2016.7109122%2C7.38882426%2017.4902268%2C8.64669632%20C15.5693624%2C8.29286451%2016.0076715%2C12.6635719%2016.0076715%2C12.6635719%20L16.4243085%2C13.7953913%20C15.6060724%2C14.326139%2016.1748571%2C14.9679015%2016.2031636%2C15.7065254%20C16.243412%2C16.7972119%2016.9108272%2C16.5712018%2016.9108272%2C16.5712018%20C16.9519602%2C18.3713211%2017.8396357%2C18.6057347%2017.8396357%2C18.6057347%20C18.0063789%2C19.7362273%2017.9024408%2C19.5438313%2017.9024408%2C19.5438313%20L17.1125113%2C19.6393659%20C17.1232047%2C19.896452%2017.1022601%2C20.1538778%2017.0501485%2C20.405854%20C16.12134%2C20.8198372%2015.921425%2C21.0626543%2014.9983663%2C21.4673494%20C13.215054%2C22.2488754%2011.2769403%2C23.2652573%2010.9323966%2C24.6337018%20C10.5878529%2C26.0021463%209.56350982%2C31.4100231%209.56350982%2C31.4100231%20L30.4356056%2C31.4100231%20L30.4356056%2C31.4100231%20L30.4356056%2C31.4100231%20L30.4364902%2C31.4100231%20Z%22/%3E%0A%3C/svg%3E%0A')"
                            })
                    )
                    .bind("click", function () {
                        filterResponsible(_$(this));
                    })
                    .append(
                        _$("<div>").text(
                            taskCounts[name] + (taskCounts[name] === 1 ? " Aufgabe" : " Aufgaben")
                        )
                    ).appendTo($bxSums);
            }
        }

        // Zeige Gesamtsumme - HERVORGEHOBEN
        if (totalTasks > 0) {
            _$("<li>")
                .addClass("totals")
                .css({
                    'display': 'flex',
                    'align-items': 'center',
                    'gap': '6px',
                    'padding': '6px 8px',
                    'margin-top': '4px',
                    'background-color': '#4a90e2',
                    'color': '#fff',
                    'border-radius': '4px',
                    'font-weight': 'bold',
                    'font-size': '12px',
                    'cursor': 'pointer'
                })
                .bind("click", function () {
                    filterResponsible(_$(this), null);
                })
            .append(
                _$("<div>")
                    .css({
                        'width': '20px',
                        'height': '20px',
                        'display': 'flex',
                        'align-items': 'center',
                        'justify-content': 'center',
                        'flex-shrink': '0'
                    })
                .html('<svg viewBox="0 0 24 24" width="16" height="16"><path fill="#fff" d="M12,6A3,3 0 0,0 9,9A3,3 0 0,0 12,12A3,3 0 0,0 15,9A3,3 0 0,0 12,6M6,8.17A2.5,2.5 0 0,0 3.5,10.67A2.5,2.5 0 0,0 6,13.17C6.88,13.17 7.65,12.71 8.09,12.03C7.42,11.18 7,10.15 7,9C7,8.8 7,8.6 7.04,8.4C6.72,8.25 6.37,8.17 6,8.17M18,8.17C17.63,8.17 17.28,8.25 16.96,8.4C17,8.6 17,8.8 17,9C17,10.15 16.58,11.18 15.91,12.03C16.35,12.71 17.12,13.17 18,13.17A2.5,2.5 0 0,0 20.5,10.67A2.5,2.5 0 0,0 18,8.17M12,14C10,14 6,15 6,17V19H18V17C18,15 14,14 12,14M4.67,14.97C3,15.26 1,16.04 1,17.33V19H4V17C4,16.22 4.29,15.53 4.67,14.97M19.33,14.97C19.71,15.53 20,16.22 20,17V19H23V17.33C23,16.04 21,15.26 19.33,14.97Z" /></svg>')
            ).append(
                _$("<div>").text(
                    totalTasks + (totalTasks === 1 ? " Aufgabe" : " Aufgaben")
                )
            ).appendTo($bxSums);
        }
    } else {
        $bxSums.detach();
    }
}

function setupBacklogScrollObserver($backlog) {
    var $itemsContainer = $backlog.find(".tasks-scrum__content-items");
    if (!$itemsContainer.length) {
        return;
    }

    // Verhindere mehrfache Observer
    if ($backlog.data("scroll-observer-installed")) {
        return;
    }
    $backlog.data("scroll-observer-installed", true);

    // Erstelle MutationObserver der auf neue Tasks reagiert
    var recalculateTimer = null;

    function checkAndRecalculate() {
        handleTags();
        calculateBacklogFromDOM($backlog);
    }

    var observer = new MutationObserver(function(mutations) {
        // Debounce
        clearTimeout(recalculateTimer);
        recalculateTimer = setTimeout(checkAndRecalculate, 300);
    });

    // Starte Observer - beobachte alle Änderungen (Story Points, Zuständige, etc.)
    observer.observe($itemsContainer[0], {
        childList: true,          // Neue/entfernte Elemente
        subtree: true,            // Auch in Unter-Elementen
        attributes: true,         // Attributänderungen (z.B. style, data-*, background-image)
        characterData: true,      // Textänderungen (z.B. Story Points, Tags)
        attributeOldValue: false, // Alte Werte nicht speichern (Performance)
        characterDataOldValue: false
    });

    // Zusätzlich: Scroll-Listener der regelmäßig prüft
    var scrollTimer = null;
    $itemsContainer.on('scroll', function() {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function() {
            checkAndRecalculate();
        }, 800);
    });
}

function setupSprintObserver($sprint) {
    var $itemsContainer = $sprint.find(".tasks-scrum__content-items");
    if (!$itemsContainer.length) {
        return;
    }

    // Verhindere mehrfache Observer
    if ($sprint.data("observer-installed")) {
        return;
    }
    $sprint.data("observer-installed", true);

    // Erstelle MutationObserver der auf neue Tasks reagiert
    var lastKnownCount = $sprint.find(".tasks-scrum__item:not(.tasks-scrum-entity-items-loader)").length;
    var recalculateTimer = null;

    function checkAndRecalculate() {
        // Zähle aktuelle Tasks
        var currentCount = $sprint.find(".tasks-scrum__item:not(.tasks-scrum-entity-items-loader)").length;

        // Prüfe ob sich die Anzahl geändert hat
        if (currentCount !== lastKnownCount) {
            lastKnownCount = currentCount;
            $sprint.data("loading-completed", true);

            // Prüfe ob jetzt alle Tasks geladen sind
            var $items = $sprint.find(".tasks-scrum__item:not(.tasks-scrum-entity-items-loader)");
            var $bitrixCount = $sprint.find(".tasks-scrum__sprint--point[data-hint='Aufgaben']");
            var bitrixTotalCount = 0;
            if ($bitrixCount.length) {
                bitrixTotalCount = parseInt($bitrixCount.text().trim()) || 0;
            }

            if (bitrixTotalCount > 0 && $items.length >= bitrixTotalCount) {
                showSuccessMessage($sprint);
            }

            calculateSprintFromDOM($sprint);
        }
    }

    var observer = new MutationObserver(function(mutations) {
        // Debounce
        clearTimeout(recalculateTimer);
        recalculateTimer = setTimeout(checkAndRecalculate, 300);
    });

    // Starte Observer - beobachte alle Änderungen (Story Points, Zuständige, etc.)
    observer.observe($itemsContainer[0], {
        childList: true,          // Neue/entfernte Elemente
        subtree: true,            // Auch in Unter-Elementen
        attributes: true,         // Attributänderungen (z.B. style, data-*, background-image)
        characterData: true,      // Textänderungen (z.B. Story Points, Tags)
        attributeOldValue: false, // Alte Werte nicht speichern (Performance)
        characterDataOldValue: false
    });

    // Zusätzlich: Scroll-Listener der regelmäßig prüft
    var scrollTimer = null;
    $itemsContainer.on('scroll', function() {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function() {
            checkAndRecalculate(false);
        }, 800);
    });
}

function showSuccessMessage($sprint) {
    // Entferne Warnung
    $sprint.find(".scroll-warning-banner").remove();

    // Zeige kurze Erfolgsmeldung
    var $success = _$("<div>")
        .css({
            'position': 'relative',
            'z-index': '9999',
            'background': 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
            'color': '#fff',
            'padding': '12px 16px',
            'margin': '15px 10px 15px 10px',
            'border-radius': '8px',
            'box-shadow': '0 4px 12px rgba(40, 167, 69, 0.4)',
            'display': 'flex',
            'align-items': 'center',
            'gap': '12px',
            'font-size': '14px',
            'font-weight': '600',
            'border': '2px solid rgba(255, 255, 255, 0.3)',
            'animation': 'slideDown 0.3s ease-out'
        })
        .html(
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="white" style="flex-shrink: 0;">' +
            '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' +
            '</svg>' +
            '<div style="flex: 1; font-weight: 700;">✓ Alle Aufgaben geladen - Berechnung aktualisiert!</div>'
        );

    var $container = $sprint.find(".tasks-scrum__content-header");
    if ($container.length) {
        $container.after($success);

        // Auto-remove nach 3 Sekunden
        setTimeout(function() {
            $success.fadeOut(300, function() {
                _$(this).remove();
            });
        }, 3000);
    }
}

function showScrollWarning($sprint, total, loaded) {
    // Entferne alte Warnung falls vorhanden
    $sprint.find(".scroll-warning-banner").remove();
    _$(".scroll-warning-banner").remove();

    // Starte automatisches Laden der fehlenden Items
    var sprintId = $sprint.attr("data-sprint-id");
    if (sprintId && !$sprint.data("auto-loading-started")) {
        $sprint.data("auto-loading-started", true);
        loadAllSprintItemsViaAPI($sprint, sprintId);
    }

    var $warning = _$("<div>")
        .addClass("scroll-warning-banner")
        .css({
            'position': 'relative',
            'z-index': '9999',
            'background': 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)',
            'color': '#fff',
            'padding': '10px 14px',
            'margin': '10px 10px 8px 10px',
            'border-radius': '6px',
            'box-shadow': '0 4px 12px rgba(238, 90, 111, 0.4)',
            'display': 'flex',
            'align-items': 'center',
            'gap': '10px',
            'font-size': '13px',
            'font-weight': '600',
            'border': '2px solid rgba(255, 255, 255, 0.3)'
        })
        .html(
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;">' +
            '<path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 18.5c-3.9-.96-7-5.43-7-9.5V8.3l7-3.11 7 3.11V11c0 4.07-3.1 8.54-7 9.5z" fill="white"/>' +
            '<path d="M11 7h2v7h-2zm0 8h2v2h-2z" fill="white"/>' +
            '</svg>' +
            '<div style="flex: 1; line-height: 1.5;">' +
            '<div style="font-weight: 700; margin-bottom: 2px;">⏳ Lade ' + loaded + ' von ' + total + ' Aufgaben...</div>' +
            '<div style="font-size: 11px; opacity: 0.95;">Automatisches Laden gestartet - bitte warten</div>' +
            '</div>' +
            '<button style="background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.4); color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.35)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.25)\'" onclick="this.parentElement.remove()">OK</button>'
        );

    // Füge CSS für Pulse-Animation hinzu
    if (!_$("#scroll-warning-pulse").length) {
        _$("<style>")
            .attr("id", "scroll-warning-pulse")
            .text("@keyframes pulse { 0%, 100% { box-shadow: 0 6px 16px rgba(238, 90, 111, 0.5); } 50% { box-shadow: 0 6px 24px rgba(238, 90, 111, 0.8); } }")
            .appendTo("head");
    }

    // Versuche verschiedene Container
    var $container = $sprint.find(".tasks-scrum__content-header");
    if ($container.length) {
        $container.after($warning);
        return;
    }

    $container = $sprint.find(".tasks-scrum__content-items");
    if ($container.length) {
        $container.prepend($warning);
        return;
    }

    $container = $sprint.find(".tasks-scrum__content-container");
    if ($container.length) {
        $container.prepend($warning);
        return;
    }
}

function loadAllSprintItemsViaAPI($sprint, sprintId) {
    var signedParameters = getSignedParameters();
    if (!signedParameters) {
        loadAllSprintItemsFallback($sprint, sprintId, 1);
        return;
    }

    var pageNumber = 2;
    var pageSize = 10;
    var allTasksLoaded = [];

    function loadNextPage() {
        _$.ajax({
            url: '/bitrix/services/main/ajax.php?mode=class&c=bitrix%3Atasks.scrum&action=getItems',
            method: 'POST',
            data: {
                entityId: sprintId,
                pageNumber: pageNumber,
                pageSize: pageSize,
                debugMode: 'N',
                signedParameters: signedParameters
            },
            success: function(response) {
                if (response && response.status === 'error') {
                    loadAllSprintItemsFallback($sprint, sprintId, 1);
                    return;
                }

                if (response && response.data && response.data.html) {
                    var $container = $sprint.find(".tasks-scrum__content-items");
                    var $loader = $sprint.find(".tasks-scrum-entity-items-loader");

                    if ($loader.length) {
                        _$(response.data.html).insertBefore($loader);
                    } else {
                        $container.append(response.data.html);
                    }

                    allTasksLoaded.push(response.data);

                    if (response.data.hasMorePages || (response.data.items && response.data.items.length === pageSize)) {
                        pageNumber++;
                        setTimeout(loadNextPage, 300);
                    } else {
                        $sprint.data("loading-completed", true);
                        calculateSprintFromDOM($sprint);
                    }
                } else {
                    $sprint.data("loading-completed", true);
                    calculateSprintFromDOM($sprint);
                }
            },
            error: function(xhr, status, error) {
                loadAllSprintItemsFallback($sprint, sprintId, 1);
            }
        });
    }

    loadNextPage();
}

function getSignedParameters() {
    // 1. Versuche aus BX.Tasks.Scrum Komponente
    if (typeof BX !== 'undefined' && BX.Tasks && BX.Tasks.Scrum) {
        try {
            var scrumComponents = document.querySelectorAll('[data-id^="tasks-scrum"]');
            for (var i = 0; i < scrumComponents.length; i++) {
                var el = scrumComponents[i];
                if (el.__component && el.__component.signedParameters) {
                    return el.__component.signedParameters;
                }
            }
        } catch (e) {}
    }

    // 2. Suche im Vue/React Component Data
    try {
        var $scrum = _$('.tasks-scrum');
        if ($scrum.length && $scrum[0].__vue__) {
            var vueData = $scrum[0].__vue__;
            if (vueData && vueData.signedParameters) {
                return vueData.signedParameters;
            }
        }
    } catch (e) {}

    // 3. Suche in allen Script-Tags nach der Komponenten-Initialisierung
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
        var scriptContent = scripts[i].textContent;

        var match = scriptContent.match(/signedParameters['":\s]+["']([^"']+)["']/);
        if (match && match[1]) {
            return match[1];
        }

        match = scriptContent.match(/"signedParameters":"([^"]+)"/);
        if (match && match[1]) {
            return match[1];
        }
    }

    // 4. Letzte Möglichkeit: Lese aus einem bereits durchgeführten AJAX-Request
    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
        try {
            var resources = performance.getEntriesByType('resource');
            for (var i = resources.length - 1; i >= 0; i--) {
                var url = resources[i].name;
                if (url.includes('tasks.scrum') && url.includes('signedParameters=')) {
                    var match = url.match(/signedParameters=([^&]+)/);
                    if (match && match[1]) {
                        return decodeURIComponent(match[1]);
                    }
                }
            }
        } catch (e) {}
    }

    return null;
}

function loadAllSprintItemsFallback($sprint, sprintId, attempt) {
    attempt = attempt || 1;

    var $itemsContainer = $sprint.find(".tasks-scrum__content-items");
    if (!$itemsContainer.length) {
        return;
    }

    var currentCount = $sprint.find(".tasks-scrum__item:not(.tasks-scrum-entity-items-loader)").length;

    var tracking = $sprint.data("loading-tracking");
    if (!tracking) {
        tracking = {
            startCount: currentCount,
            lastCount: currentCount,
            sameCountAttempts: 0
        };
        $sprint.data("loading-tracking", tracking);
    }

    // Finde den Loader und scrolle ihn in den sichtbaren Bereich
    var $loader = $sprint.find(".tasks-scrum-entity-items-loader.--waiting");
    if ($loader.length) {
        // Scrolle den Loader in den Viewport - das triggert den IntersectionObserver
        $loader[0].scrollIntoView({ behavior: 'instant', block: 'center' });
    } else {
        // Fallback: Finde den scrollbaren übergeordneten Container
        var $scrollContainer = _$(".tasks-scrum__sprints");
        if ($scrollContainer.length && $scrollContainer[0].scrollHeight > $scrollContainer[0].clientHeight) {
            var scrollContainer = $scrollContainer[0];
            scrollContainer.scrollTop = scrollContainer.scrollTop + 300;
        } else {
            // Letzte Option: Scroll im Window
            window.scrollBy(0, 300);
        }
    }

    _.delay(function() {
        var newCount = $sprint.find(".tasks-scrum__item:not(.tasks-scrum-entity-items-loader)").length;
        var hasLoader = $sprint.find(".tasks-scrum-entity-items-loader.--waiting").length > 0;

        if (newCount === tracking.lastCount) {
            tracking.sameCountAttempts++;
        } else {
            tracking.sameCountAttempts = 0;
            tracking.lastCount = newCount;
        }

        var expectedCount = $sprint.data("expected-count") || 0;
        var foundAllTasks = (expectedCount > 0 && newCount >= expectedCount);

        // Stoppe auch wenn kein Loader mehr da ist
        var shouldStop = tracking.sameCountAttempts >= 3 || foundAllTasks || !hasLoader;
        var maxAttemptsReached = attempt >= 15;

        if (shouldStop || maxAttemptsReached) {
            // Scrolle zurück zum Sprint-Header
            var $header = $sprint.find(".tasks-scrum__content-header");
            if ($header.length) {
                $header[0].scrollIntoView({ behavior: 'instant', block: 'start' });
            }
            $sprint.removeData("loading-tracking");
            $sprint.data("loading-completed", true);
            // Entferne die Warnung
            $sprint.find(".scroll-warning-banner").remove();
            calculateSprintFromDOM($sprint);
        } else {
            loadAllSprintItemsFallback($sprint, sprintId, attempt + 1);
        }
    }, 500);
}

function calculateSprintFromDOM($sprint, skipHandleTags) {
    // Verarbeite Tags für neu geladene Aufgaben
    if (!skipHandleTags) {
        handleTags();
    }

    var
        $container = $sprint.find(".tasks-scrum__content-container"),
        $bxSums = $sprint.find(".customBxSums"),
        $header = $sprint.find(".tasks-scrum__content-header"),
        $items = $sprint.find(".tasks-scrum__item:not(.tasks-scrum-entity-items-loader)"),
        estimations = {},
        spent = {},
        rest = {},
        responsibles = {},
        taskCounts = {},
        totalRest = 0,
        totalSpent = 0,
        totalEstimated = 0,
        totalTasks = 0;

    var $bitrixCount = $sprint.find(".tasks-scrum__sprint--point[data-hint='Aufgaben']");
    var bitrixTotalCount = 0;
    if ($bitrixCount.length) {
        bitrixTotalCount = parseInt($bitrixCount.text().trim()) || 0;
        if (bitrixTotalCount > $items.length) {
            showScrollWarning($sprint, bitrixTotalCount, $items.length);
        } else {
            $sprint.find(".scroll-warning-banner").remove();
        }
    }

    if (!$items.length) {
        $bxSums.detach();
        return;
    }

    var hasLoader = $sprint.find(".tasks-scrum-entity-items-loader.--waiting").length > 0;
    var sprintId = $sprint.attr("data-sprint-id");
    var sprintName = $sprint.find(".tasks-scrum__title").text() || "Sprint " + sprintId;
    var loadingCompleted = $sprint.data("loading-completed");

    if (hasLoader && !$sprint.data("force-loading-started") && !loadingCompleted) {
        $sprint.data("force-loading-started", true);
        $sprint.data("expected-count", bitrixTotalCount);
        return;
    }

    // Sammle eindeutige Task-IDs um Duplikate zu vermeiden
    var processedTaskIds = {};

    // Sammle Story Points und Rest aus dem DOM
    $items.each(function() {
        var
            $item = _$(this),
            taskId = $item.attr("data-id"),
            $storyPointsEl = $item.find(".tasks-scrum__item--story-points-element-text"),
            $responsibleEl = $item.find(".tasks-scrum__item--responsible span"),
            $hashtagEl = $item.find(".tasks-scrum__item--hashtag"),
            $responsiblePhotoEl = $item.find(".tasks-scrum__item--responsible-photo i"),
            responsibleName = $responsibleEl.text().trim() || "Unbekannt",
            responsibleImg = $responsiblePhotoEl.css("background-image"),
            points = 0,
            pointsRest = 0;

        // Überspringe Duplikate
        if (taskId && processedTaskIds[taskId]) {
            return; // continue in jQuery.each
        }
        if (taskId) {
            processedTaskIds[taskId] = true;
        }

        // Lese Story Points
        if ($storyPointsEl.length) {
            var pointsText = $storyPointsEl.text().trim();
            if (pointsText !== '-') {
                points = parseFloat(pointsText) || 0;
                pointsRest = points; // Default: Rest = Story Points (noch nichts erledigt)
            }
        }

        // Suche nach Rest-Tags
        if ($hashtagEl.length) {
            var tagText = $hashtagEl.text().trim();
            if (tagText) {
                // Entferne # am Anfang falls vorhanden
                var cleanTag = tagText.replace(/^#/, '');
                var match = cleanTag.match(/^Rest\s*:?\s*([\d.,]+)\s*?$/i);
                if (match && match.length > 1) {
                    pointsRest = parseFloat(match[1].replace(',', '.')) || 0;
                }
            }
        }

        // Zähle alle Aufgaben, auch ohne Story Points
        if (!taskCounts[responsibleName]) {
            taskCounts[responsibleName] = 0;
        }

        if (!responsibles[responsibleName]) {
            responsibles[responsibleName] = {
                name: responsibleName,
                photo: responsibleImg
            };
        }

        taskCounts[responsibleName] += 1;
        totalTasks += 1;

        if (points > 0) {
            if (!spent[responsibleName]) {
                spent[responsibleName] = 0;
            }

            if (!estimations[responsibleName]) {
                estimations[responsibleName] = 0;
            }

            if (!rest[responsibleName]) {
                rest[responsibleName] = 0;
            }

            // Bei Story Points: Spent = Estimated - Rest
            var pointsSpent = points - pointsRest;

            spent[responsibleName] += pointsSpent;
            estimations[responsibleName] += points;
            rest[responsibleName] += pointsRest;

            totalSpent += pointsSpent;
            totalEstimated += points;
            totalRest += pointsRest;
        }
    });

    // Erstelle oder aktualisiere die Anzeige
    if (totalEstimated > 0) {
        if (!$bxSums.length) {
            $bxSums = _$("<ul>")
                .addClass("customBxSums customBxSums-sprint")
                .css({
                    'list-style': 'none',
                    'padding': '6px 10px',
                    'margin': '0 0 6px 0',
                    'background': '#fff',
                    'border-radius': '4px',
                    'box-shadow': '0 1px 2px rgba(0,0,0,0.08)'
                });
            $container.before($bxSums);
        }
        $bxSums.empty();

        // Zeige Story Points pro Verantwortlichem
        for (var name in responsibles) {
            var
                r = responsibles[name] || {},
                icon = r.photo;

            // Zeige alle Personen mit Aufgaben (nicht nur die mit Story Points)
            if (taskCounts[name] > 0) {
                var displayText = "";

                // Story Points anzeigen, wenn vorhanden
                if (estimations[name] > 0) {
                    displayText = formatStoryPoints(estimations[name]) + "h" +
                        (rest[name] ? " (Rest: " + formatStoryPoints(rest[name]) + "h)" : "");
                } else {
                    displayText = "0h";
                }

                // Anzahl der Aufgaben hinzufügen
                displayText += " | " + taskCounts[name] + (taskCounts[name] === 1 ? " Aufgabe" : " Aufgaben");

                _$("<li>")
                    .addClass("uSum")
                    .data("name", name)
                    .css({
                        'display': 'flex',
                        'align-items': 'center',
                        'gap': '6px',
                        'padding': '3px 0',
                        'font-size': '12px',
                        'cursor': 'pointer'
                    })
                    .append(
                        _$("<div>")
                            .attr("title", name)
                            .addClass("tasks-kanban-item-author-avatar")
                            .css({
                                'width': '20px',
                                'height': '20px',
                                'border-radius': '50%',
                                'background-size': 'cover',
                                'background-position': 'center',
                                'flex-shrink': '0',
                                'background-image': icon || "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2040%2040%22%3E%0A%20%20%20%20%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%2220%22%20fill%3D%22%23525C68%22/%3E%0A%20%20%20%20%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M30.4364902%2C31.4100231%20C30.4364902%2C29.9871769%2028.8398242%2C23.9680557%2028.8398242%2C23.9680557%20C28.8398242%2C23.0883414%2027.6898708%2C22.083459%2025.4253473%2C21.4978674%20C24.6581347%2C21.2838747%2023.9288072%2C20.9520366%2023.2634349%2C20.514215%20C23.1179216%2C20.4310645%2023.1400361%2C19.6628072%2023.1400361%2C19.6628072%20L22.4107003%2C19.5517925%20C22.4107003%2C19.4894296%2022.3483374%2C18.5681401%2022.3483374%2C18.5681401%20C23.2209751%2C18.274902%2023.1311903%2C16.5451067%2023.1311903%2C16.5451067%20C23.6853794%2C16.8524981%2024.0462878%2C15.4836113%2024.0462878%2C15.4836113%20C24.7017612%2C13.5817654%2023.719878%2C13.6967607%2023.719878%2C13.6967607%20C23.8916546%2C12.5357299%2023.8916546%2C11.3557413%2023.719878%2C10.1947105%20C23.283338%2C6.34325128%2016.7109122%2C7.38882426%2017.4902268%2C8.64669632%20C15.5693624%2C8.29286451%2016.0076715%2C12.6635719%2016.0076715%2C12.6635719%20L16.4243085%2C13.7953913%20C15.6060724%2C14.326139%2016.1748571%2C14.9679015%2016.2031636%2C15.7065254%20C16.243412%2C16.7972119%2016.9108272%2C16.5712018%2016.9108272%2C16.5712018%20C16.9519602%2C18.3713211%2017.8396357%2C18.6057347%2017.8396357%2C18.6057347%20C18.0063789%2C19.7362273%2017.9024408%2C19.5438313%2017.9024408%2C19.5438313%20L17.1125113%2C19.6393659%20C17.1232047%2C19.896452%2017.1022601%2C20.1538778%2017.0501485%2C20.405854%20C16.12134%2C20.8198372%2015.921425%2C21.0626543%2014.9983663%2C21.4673494%20C13.215054%2C22.2488754%2011.2769403%2C23.2652573%2010.9323966%2C24.6337018%20C10.5878529%2C26.0021463%209.56350982%2C31.4100231%209.56350982%2C31.4100231%20L30.4356056%2C31.4100231%20L30.4356056%2C31.4100231%20L30.4356056%2C31.4100231%20L30.4364902%2C31.4100231%20Z%22/%3E%0A%3C/svg%3E%0A')"
                            })
                    )
                    .bind("click", function () {
                        filterResponsible(_$(this));
                    })
                    .append(
                        _$("<div>").text(displayText)
                    ).appendTo($bxSums);
            }
        }

        // Zeige Gesamtsumme - HERVORGEHOBEN
        if (totalEstimated > 0) {
            var summaryText = formatStoryPoints(totalEstimated) + "h"
                + (totalRest ? " (Rest: " + formatStoryPoints(totalRest) + "h)" : "")
                + (totalTasks ? " | " + totalTasks + (totalTasks === 1 ? " Aufgabe" : " Aufgaben") : "");

            // Wenn nicht alle Tasks geladen wurden, zeige Warnung
            if (bitrixTotalCount > 0 && totalTasks < bitrixTotalCount) {
                summaryText += " ⚠ " + bitrixTotalCount + " gesamt";
            }

            _$("<li>")
                .addClass("totals")
                .css({
                    'display': 'flex',
                    'align-items': 'center',
                    'gap': '6px',
                    'padding': '6px 8px',
                    'margin-top': '4px',
                    'background-color': (bitrixTotalCount > totalTasks ? '#e67e22' : '#4a90e2'),
                    'color': '#fff',
                    'border-radius': '4px',
                    'font-weight': 'bold',
                    'font-size': '12px',
                    'cursor': 'pointer'
                })
                .attr('title', bitrixTotalCount > totalTasks ? 'Achtung: Nur ' + totalTasks + ' von ' + bitrixTotalCount + ' Tasks geladen. Bitrix Lazy-Loading Limitation.' : '')
                .bind("click", function () {
                    filterResponsible(_$(this), null);
                })
            .append(
                _$("<div>")
                    .css({
                        'width': '20px',
                        'height': '20px',
                        'display': 'flex',
                        'align-items': 'center',
                        'justify-content': 'center',
                        'flex-shrink': '0'
                    })
                .html('<svg viewBox="0 0 24 24" width="16" height="16"><path fill="#fff" d="M12,6A3,3 0 0,0 9,9A3,3 0 0,0 12,12A3,3 0 0,0 15,9A3,3 0 0,0 12,6M6,8.17A2.5,2.5 0 0,0 3.5,10.67A2.5,2.5 0 0,0 6,13.17C6.88,13.17 7.65,12.71 8.09,12.03C7.42,11.18 7,10.15 7,9C7,8.8 7,8.6 7.04,8.4C6.72,8.25 6.37,8.17 6,8.17M18,8.17C17.63,8.17 17.28,8.25 16.96,8.4C17,8.6 17,8.8 17,9C17,10.15 16.58,11.18 15.91,12.03C16.35,12.71 17.12,13.17 18,13.17A2.5,2.5 0 0,0 20.5,10.67A2.5,2.5 0 0,0 18,8.17M12,14C10,14 6,15 6,17V19H18V17C18,15 14,14 12,14M4.67,14.97C3,15.26 1,16.04 1,17.33V19H4V17C4,16.22 4.29,15.53 4.67,14.97M19.33,14.97C19.71,15.53 20,16.22 20,17V19H23V17.33C23,16.04 21,15.26 19.33,14.97Z" /></svg>')
            ).append(
                _$("<div>").text(summaryText)
            ).appendTo($bxSums);
        }
    } else {
        $bxSums.detach();
    }
}
