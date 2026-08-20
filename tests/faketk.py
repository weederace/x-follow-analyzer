"""
faketk.py — a stand-in for tkinter, so the desktop app can be tested without a display.

Why this exists
---------------
The desktop triage desk cannot be exercised in CI or in a container: importing
tkinter needs Tk, and Tk needs an X display. Mocking with unittest.mock would let
every typo through, because a Mock answers to any attribute. This is the opposite:
a small, real implementation of the exact slice of Tk that x_follow_analyzer.py
uses, which records what happened so a test can assert on it.

Two behaviours are deliberately strict, because they catch real bugs:

* configure() on a destroyed widget raises TclError, exactly as Tk does. That is
  how we prove the card's buttons stay out of the theme sweep — they are destroyed
  and rebuilt on every repaint, and a stale reference would blow up here.
* after()/after_cancel() are a real queue you drain by hand. Nothing fires unless
  the test says so, which is what makes it possible to inspect a card while its
  stamp is still in flight.

Anything the app does not use is missing on purpose: a failure should mean the app
is wrong, not that the shim is incomplete.
"""

from __future__ import annotations

import sys
import time
import types


class TclError(Exception):
    pass


class Event:
    def __init__(self, **kw):
        self.width = kw.get("width", 720)
        self.height = kw.get("height", 300)
        self.x = kw.get("x", 0)
        self.y = kw.get("y", 0)
        self.keysym = kw.get("keysym", "")


class Widget:
    default_width = 700

    def __init__(self, master=None, **kw):
        self.master = master
        self.opts = dict(kw)
        self.children = []
        self.packed = False
        self.pack_opts = {}
        self.bindings = {}
        self.destroyed = False
        self._width = self.default_width
        if hasattr(master, "children"):
            master.children.append(self)

    # -- options ----------------------------------------------------------------
    def configure(self, cnf=None, **kw):
        if self.destroyed:
            raise TclError('invalid command name ".!destroyed"')
        if isinstance(cnf, dict):
            self.opts.update(cnf)
        self.opts.update(kw)

    config = configure

    def cget(self, key):
        return self.opts.get(key)

    def __getitem__(self, key):
        return self.opts.get(key)

    # -- geometry ---------------------------------------------------------------
    def pack(self, **kw):
        if self.destroyed:
            raise TclError("cannot pack a destroyed widget")
        # Real Tk raises if the anchor of before=/after= is not managed. Mirroring
        # that is the whole reason the app stopped using them.
        for key in ("before", "after"):
            anchor = kw.get(key)
            if anchor is not None and not getattr(anchor, "packed", False):
                raise TclError(f"window {anchor!r} isn't packed")
        self.packed = True
        self.pack_opts = kw

    def pack_forget(self):
        self.packed = False

    def pack_propagate(self, flag=None):
        return None

    def destroy(self):
        self.destroyed = True
        self.packed = False

    # -- events -----------------------------------------------------------------
    def bind(self, sequence, func=None, add=None):
        self.bindings[sequence] = func

    def fire(self, sequence, event=None):
        func = self.bindings.get(sequence)
        if func is None:
            raise AssertionError(f"nothing bound to {sequence}")
        return func(event if event is not None else Event())

    # -- measurement ------------------------------------------------------------
    def winfo_width(self):
        return self._width

    def winfo_height(self):
        return 300

    def winfo_exists(self):
        return not self.destroyed

    # -- walking ----------------------------------------------------------------
    def walk(self):
        for child in self.children:
            yield child
            yield from child.walk()


class Frame(Widget):
    pass


class Label(Widget):
    pass


class Button(Widget):
    def invoke(self):
        if self.destroyed:
            raise TclError("cannot invoke a destroyed widget")
        if self.opts.get("state") == "disabled":
            return None
        command = self.opts.get("command")
        return command() if command else None


class Entry(Widget):
    def __init__(self, master=None, **kw):
        super().__init__(master, **kw)
        self.text = ""

    def get(self):
        return self.text

    def insert(self, index, value):
        self.text = value if index == 0 else self.text + value

    def delete(self, first, last=None):
        self.text = ""


class Canvas(Widget):
    default_width = 720

    def __init__(self, master=None, **kw):
        super().__init__(master, **kw)
        self.items = []
        self._next = 0

    def _add(self, kind, coords, opts):
        self._next += 1
        self.items.append({"id": self._next, "type": kind,
                           "coords": list(coords), "opts": opts})
        return self._next

    def create_rectangle(self, *coords, **opts):
        return self._add("rect", coords, opts)

    def create_polygon(self, *coords, **opts):
        flat = coords[0] if len(coords) == 1 and isinstance(coords[0], (list, tuple)) else coords
        return self._add("polygon", flat, opts)

    def create_line(self, *coords, **opts):
        flat = coords[0] if len(coords) == 1 and isinstance(coords[0], (list, tuple)) else coords
        return self._add("line", flat, opts)

    def create_text(self, x, y, **opts):
        return self._add("text", (x, y), opts)

    def create_window(self, x, y, **opts):
        return self._add("window", (x, y), opts)

    def delete(self, *which):
        if "all" in which:
            self.items = []
            return
        drop = set(which)
        self.items = [i for i in self.items if i["id"] not in drop]

    def find_all(self):
        return [i["id"] for i in self.items]

    def move(self, item, dx, dy):
        for entry in self.items:
            if entry["id"] == item:
                coords = entry["coords"]
                for index in range(0, len(coords) - 1, 2):
                    coords[index] += dx
                    coords[index + 1] += dy

    # -- convenience for assertions --------------------------------------------
    def texts(self):
        return [i["opts"].get("text", "") for i in self.items if i["type"] == "text"]

    def windows(self):
        return [i["opts"].get("window") for i in self.items if i["type"] == "window"]

    def fills(self):
        out = []
        for entry in self.items:
            for key in ("fill", "outline"):
                value = entry["opts"].get(key)
                if value:
                    out.append(value)
        return out


class Tk(Widget):
    def __init__(self, **kw):
        super().__init__(None, **kw)
        self.title_text = ""
        self.jobs = []
        self._job_seq = 0
        self.focus = None

    def title(self, text=None):
        if text is not None:
            self.title_text = text
        return self.title_text

    def geometry(self, spec=None):
        return spec

    def minsize(self, w=None, h=None):
        return (w, h)

    def focus_get(self):
        return self.focus

    def mainloop(self):
        raise AssertionError("mainloop() must not run in tests")

    # -- the timer queue --------------------------------------------------------
    def after(self, ms, func=None, *args):
        self._job_seq += 1
        token = f"after#{self._job_seq}"
        self.jobs.append({"id": token, "ms": ms, "func": func, "args": args})
        return token

    def after_cancel(self, token):
        before = len(self.jobs)
        self.jobs = [j for j in self.jobs if j["id"] != token]
        if len(self.jobs) == before:
            raise TclError(f'invalid command name "{token}"')

    def run_pending(self):
        """Fire every queued callback once, soonest delay first."""
        due, self.jobs = sorted(self.jobs, key=lambda j: j["ms"]), []
        for job in due:
            if job["func"]:
                job["func"](*job["args"])

    def pump(self, rounds=60, delay=0.01):
        """Drain the queue repeatedly, for callbacks that reschedule themselves."""
        for _ in range(rounds):
            if not self.jobs:
                return
            self.run_pending()
            time.sleep(delay)


# ==============================================================================
# ttk
# ==============================================================================
class Treeview(Widget):
    def __init__(self, master=None, **kw):
        super().__init__(master, **kw)
        self.order = []
        self.rows = {}
        self.headings = {}
        self.columns = {}
        self.tags = {}
        self._selection = ()

    def heading(self, column, **kw):
        self.headings[column] = kw

    def column(self, column, **kw):
        self.columns[column] = kw

    def tag_configure(self, tag, **kw):
        self.tags[tag] = kw

    def insert(self, parent, index, iid=None, values=(), tags=()):
        key = iid or f"I{len(self.order) + 1}"
        self.order.append(key)
        self.rows[key] = {"values": tuple(values), "tags": tuple(tags)}
        return key

    def get_children(self, item=""):
        return tuple(self.order)

    def delete(self, *items):
        for key in items:
            if key in self.rows:
                del self.rows[key]
                self.order.remove(key)
        self._selection = tuple(k for k in self._selection if k in self.rows)

    def selection(self):
        return self._selection

    def selection_set(self, *items):
        self._selection = tuple(items)

    def yview(self, *args):
        return None

    def values_at(self, iid):
        return self.rows[iid]["values"]


class Scrollbar(Widget):
    def set(self, first, last):
        return None


class Combobox(Widget):
    def __init__(self, master=None, **kw):
        super().__init__(master, **kw)
        self.value = ""

    def set(self, value):
        self.value = value

    def get(self):
        return self.value


class Style:
    def __init__(self, master=None):
        self.configured = {}
        self.mapped = {}
        self.theme = None

    def theme_use(self, name=None):
        if name is not None:
            self.theme = name
        return self.theme

    def configure(self, style, **kw):
        self.configured.setdefault(style, {}).update(kw)

    def map(self, style, **kw):
        self.mapped.setdefault(style, {}).update(kw)


# ==============================================================================
# Dialogs, fonts, and installation
# ==============================================================================
class Recorder:
    """Test-visible state: what the dialogs will answer, and what was asked."""

    def __init__(self):
        self.open_path = ""
        self.save_path = ""
        self.answer_yes = True
        self.asked = []
        self.errors = []
        self.infos = []
        self.families = ("DejaVu Sans", "DejaVu Sans Mono", "Tahoma")


REC = Recorder()


def install():
    """Register the shim in sys.modules. Call before importing the app."""
    tkinter = types.ModuleType("tkinter")
    for name, obj in (("Tk", Tk), ("Frame", Frame), ("Label", Label), ("Button", Button),
                      ("Entry", Entry), ("Canvas", Canvas), ("Widget", Widget),
                      ("TclError", TclError), ("Event", Event)):
        setattr(tkinter, name, obj)

    ttk = types.ModuleType("tkinter.ttk")
    ttk.Treeview, ttk.Scrollbar, ttk.Combobox, ttk.Style = Treeview, Scrollbar, Combobox, Style

    font = types.ModuleType("tkinter.font")
    font.families = lambda root=None: REC.families

    filedialog = types.ModuleType("tkinter.filedialog")
    filedialog.askopenfilename = lambda **kw: REC.open_path
    filedialog.asksaveasfilename = lambda **kw: REC.save_path

    messagebox = types.ModuleType("tkinter.messagebox")

    def askyesno(title="", message="", **kw):
        REC.asked.append((title, message))
        return REC.answer_yes

    messagebox.askyesno = askyesno
    messagebox.showerror = lambda title="", message="", **kw: REC.errors.append(message)
    messagebox.showinfo = lambda title="", message="", **kw: REC.infos.append(message)
    messagebox.showwarning = lambda title="", message="", **kw: REC.errors.append(message)

    tkinter.ttk, tkinter.font = ttk, font
    tkinter.filedialog, tkinter.messagebox = filedialog, messagebox

    sys.modules.update({
        "tkinter": tkinter,
        "tkinter.ttk": ttk,
        "tkinter.font": font,
        "tkinter.filedialog": filedialog,
        "tkinter.messagebox": messagebox,
    })
    return REC
