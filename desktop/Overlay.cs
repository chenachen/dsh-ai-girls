using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;

public sealed class Overlay : Window
{
    static readonly StreamReader Input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
    static readonly StreamWriter Output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly StackPanel cards = new StackPanel();
    readonly TextBlock heading;
    readonly Border orb;
    readonly Border bubble;
    readonly Button expand;
    readonly List<KeyValuePair<TextBlock,double>> elapsed = new List<KeyValuePair<TextBlock,double>>();
    bool expanded;
    bool bubbleHidden;
    readonly object snapshotLock = new object();
    Dictionary<string,object>[] pendingTasks;
    bool renderQueued;
    Dictionary<string, object>[] tasks = new Dictionary<string, object>[0];
    readonly DispatcherTimer clock = new DispatcherTimer();
    readonly string settingsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DshAiGirls", "window.txt");
    volatile bool receiving = true;
    long revision;
    IntPtr handle;

    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", EntryPoint="GetWindowLong")] static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint="SetWindowLong")] static extern int SetWindowLong(IntPtr window, int index, int value);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);

    [STAThread]
    public static void Main()
    {
        new Application().Run(new Overlay());
    }

    public Overlay()
    {
        Title = "AI 娘值班室 · 全局任务";
        Width = 350; SizeToContent = SizeToContent.Height; MaxHeight = 620;
        WindowStyle = WindowStyle.None; AllowsTransparency = true; Background = Brushes.Transparent;
        Topmost = true; ShowInTaskbar = false; ShowActivated = false; ResizeMode = ResizeMode.NoResize;
        FontFamily = new FontFamily("Microsoft YaHei UI");
        Left = SystemParameters.WorkArea.Right - Width - 28; Top = SystemParameters.WorkArea.Bottom - 260;
        LoadPosition();
        var root = new StackPanel { Margin = new Thickness(8), Background = null };
        bubble = new Border { Background = Color("#F51B2438"), BorderBrush = Color("#535D7FA5"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(18), Padding = new Thickness(16,12,16,14) };
        var body = new StackPanel();
        var header = new DockPanel { Margin = new Thickness(0,0,0,10) };
        var close = new Button { Content = "×", FontSize = 18, Width = 26, Height = 24, Foreground = Color("#AAB6CE"), Background = Brushes.Transparent, BorderThickness = new Thickness(0), ToolTip = "关闭桌面窗口（不停止任务）", Focusable = false };
        DockPanel.SetDock(close,Dock.Right); close.Click += delegate { Close(); }; header.Children.Add(close);
        var collapse = new Button { Content = "−", Width = 26, Height = 24, Foreground = Color("#AAB6CE"), Background = Brushes.Transparent, BorderThickness = new Thickness(0), ToolTip = "收起气泡；右键 AI 图标可恢复", Focusable = false };
        DockPanel.SetDock(collapse,Dock.Right); collapse.Click += delegate { bubbleHidden=true; Render(); }; header.Children.Add(collapse);
        heading = Text("全局任务 · 正在连接", 12, "#A6BCD9"); header.Children.Add(heading);
        header.MouseLeftButtonDown += Drag;
        body.Children.Add(header);
        var scroll = new ScrollViewer { Content = cards, MaxHeight = 420, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
        body.Children.Add(scroll);
        expand = new Button { Foreground = Color("#A6CFF1"), Background = Brushes.Transparent, BorderThickness = new Thickness(0), HorizontalAlignment=HorizontalAlignment.Left, Padding=new Thickness(0,5,0,0), Focusable=false };
        expand.Click += delegate { expanded=!expanded; Render(); };
        body.Children.Add(expand); bubble.Child = body; root.Children.Add(bubble);
        orb = new Border { Width = 66, Height = 66, Margin = new Thickness(0,12,22,0), HorizontalAlignment = HorizontalAlignment.Right,
            CornerRadius = new CornerRadius(33), Background = Color("#FF72B7EF"), BorderBrush = Color("#CCCEEAFE"), BorderThickness = new Thickness(2), Cursor = Cursors.SizeAll,
            Child = new TextBlock { Text = "AI", FontSize = 22, FontWeight = FontWeights.Bold, Foreground = Color("#FF142946"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } };
        orb.ToolTip="拖动调整位置；右键显示/收起任务气泡";
        orb.MouseLeftButtonDown += Drag;
        orb.MouseRightButtonUp += delegate { bubbleHidden=!bubbleHidden; Render(); };
        root.Children.Add(orb); Content = root;
        var animation = new DoubleAnimation(0.6,1,TimeSpan.FromSeconds(1.4)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
        orb.BeginAnimation(UIElement.OpacityProperty,animation);
        SourceInitialized += delegate {
            handle = new WindowInteropHelper(this).Handle;
            SetWindowLong(handle,-20,GetWindowLong(handle,-20) | 0x08000080); // NOACTIVATE | TOOLWINDOW
            HwndSource.FromHwnd(handle).AddHook(WndProc);
        };
        Loaded += delegate { Clamp(); Emit(new {type="ready"}); StartReader(); };
        SizeChanged += delegate(object sender,SizeChangedEventArgs e) { if(e.PreviousSize.Height>0) Top+=e.PreviousSize.Height-e.NewSize.Height; Clamp(); };
        Closing += delegate { receiving=false; clock.Stop(); SavePosition(); };
        clock.Interval = TimeSpan.FromSeconds(1); clock.Tick += delegate { UpdateElapsed(); }; clock.Start();
    }

    IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == 0x0021) { handled=true; return new IntPtr(3); } // MA_NOACTIVATE
        return IntPtr.Zero;
    }

    void StartReader()
    {
        var reader = new Thread(delegate() {
            try {
                string line;
                while (receiving && (line=Input.ReadLine()) != null) {
                    var message = json.Deserialize<Dictionary<string,object>>(line);
                    if (Str(message,"type") != "snapshot" || Str(message,"protocol") != "1") continue;
                    object raw;
                    var list = message.TryGetValue("tasks",out raw) ? raw as IEnumerable : null;
                    var next = list == null ? new Dictionary<string,object>[0] : list.Cast<object>().OfType<Dictionary<string,object>>().ToArray();
                    lock(snapshotLock) {
                        pendingTasks=next;
                        if (renderQueued) continue;
                        renderQueued=true;
                    }
                    Dispatcher.BeginInvoke(new Action(delegate {
                        lock(snapshotLock) { tasks=pendingTasks; renderQueued=false; }
                        revision++; Render();
                    }));
                }
            } catch (Exception ex) { Console.Error.WriteLine("Overlay input: " + ex.Message); }
            finally { if (receiving) Dispatcher.BeginInvoke(new Action(Close)); }
        });
        reader.IsBackground=true; reader.Start();
    }

    void Render()
    {
        cards.Children.Clear();
        elapsed.Clear();
        var active = tasks.Count(t => Active(Str(t,"state")));
        heading.Text = "全局任务 · " + active + " 个执行中";
        bubble.Visibility = !bubbleHidden && tasks.Length>0 ? Visibility.Visible : Visibility.Collapsed;
        expand.Visibility = Visibility.Collapsed;
        if (tasks.Length == 0) {
            cards.Children.Add(Text("当前没有运行任务",14,"#D9E5F7"));
        } else {
            var roots = tasks.Where(t => String.IsNullOrEmpty(Str(t,"parentId")))
                .OrderBy(t => NeedsAttention(t) || HasWaitingChild(Str(t,"id"),new HashSet<string>()) ? 0 : Active(Str(t,"state")) ? 1 : 2).ToArray();
            foreach (var task in expanded ? roots : roots.Take(3)) {
                AddCard(task,false);
                if (expanded) AddChildren(Str(task,"id"),new HashSet<string>());
                else {
                    var children = DescendantCount(Str(task,"id"),new HashSet<string>());
                    if(children>0) cards.Children.Add(Text("↳ "+children+" 个子任务"+(HasWaitingChild(Str(task,"id"),new HashSet<string>()) ? " · 需要处理" : ""),11,"#A6CFF1"));
                }
            }
            if (roots.Length>3 || tasks.Any(t=>!String.IsNullOrEmpty(Str(t,"parentId")))) {
                expand.Visibility=Visibility.Visible;
                expand.Content=expanded ? "收起任务列表" : "展开全部 "+tasks.Length+" 个任务";
            }
        }
        orb.Background = Color(active > 0 ? "#FF72B7EF" : "#FF8796B9");
        UpdateElapsed();
        Emit(new {type="rendered",revision=revision,count=tasks.Length,active=active,topmost=Topmost,
            visible=handle != IntPtr.Zero && IsWindowVisible(handle),foreground=GetForegroundWindow().ToInt64(),window=handle.ToInt64()});
    }

    static bool NeedsAttention(Dictionary<string,object> task) { var state=Str(task,"state"); return state=="approval" || state=="input"; }
    bool HasWaitingChild(string id,HashSet<string> seen) { if(!seen.Add(id))return false;return tasks.Where(t=>Str(t,"parentId")==id).Any(t=>NeedsAttention(t)||HasWaitingChild(Str(t,"id"),seen)); }
    int DescendantCount(string id,HashSet<string> seen) { if(!seen.Add(id))return 0;return tasks.Where(t=>Str(t,"parentId")==id).Sum(t=>1+DescendantCount(Str(t,"id"),seen)); }

    void UpdateElapsed()
    {
        var now=(DateTime.UtcNow-new DateTime(1970,1,1)).TotalMilliseconds;
        foreach(var item in elapsed) {
            var duration=TimeSpan.FromMilliseconds(Math.Max(0,now-item.Value));
            item.Key.Text="已运行 "+((int)duration.TotalMinutes).ToString("00")+":"+duration.Seconds.ToString("00");
        }
    }

    void AddChildren(string id, HashSet<string> seen)
    {
        if (!seen.Add(id)) return;
        foreach(var child in tasks.Where(t => Str(t,"parentId")==id)) { AddCard(child,true); AddChildren(Str(child,"id"),seen); }
    }

    void AddCard(Dictionary<string,object> task, bool child)
    {
        var panel = new StackPanel { Margin = new Thickness(child ? 12 : 0,0,0,12) };
        var name = Text((child ? "↳ " : "")+Str(task,"title"),14,"#EDF4FF"); name.FontWeight=FontWeights.SemiBold;
        name.TextTrimming=TextTrimming.CharacterEllipsis; name.TextWrapping=TextWrapping.NoWrap; panel.Children.Add(name);
        var state = Str(task,"state");
        var color = state=="failed" ? "#FFA7AD" : (state=="approval" || state=="input") ? "#FFD38F" : "#8DCBFF";
        panel.Children.Add(Text(Str(task,"stage"),12,color));
        if (!String.IsNullOrEmpty(Str(task,"detail"))) panel.Children.Add(Text(Str(task,"detail"),11,"#B4C4DB"));
        object start;
        if (Active(state) && task.TryGetValue("startedAt",out start) && start != null) {
            var label=Text("",10,"#7F92B0");
            elapsed.Add(new KeyValuePair<TextBlock,double>(label,Convert.ToDouble(start))); panel.Children.Add(label);
        }
        cards.Children.Add(panel);
    }

    static bool Active(string state) { return state=="running" || state=="approval" || state=="input"; }
    static string Str(Dictionary<string,object> item, string key) { object value; return item.TryGetValue(key,out value) && value!=null ? Convert.ToString(value) : ""; }
    static Brush Color(string value) { return (Brush)new BrushConverter().ConvertFromString(value); }
    static TextBlock Text(string text, double size, string color) { return new TextBlock {Text=text,FontSize=size,Foreground=Color(color),Margin=new Thickness(0,2,0,2),TextWrapping=TextWrapping.Wrap}; }
    static void Emit(object message) { try { Output.WriteLine(new JavaScriptSerializer().Serialize(message)); } catch(IOException) {} }
    void Drag(object sender, MouseButtonEventArgs e) { if(e.ChangedButton==MouseButton.Left && e.LeftButton==MouseButtonState.Pressed) { DragMove(); Clamp(); SavePosition(); } }
    void Clamp() { Left=Math.Max(SystemParameters.VirtualScreenLeft,Math.Min(Left,SystemParameters.VirtualScreenLeft+SystemParameters.VirtualScreenWidth-Width)); Top=Math.Max(SystemParameters.VirtualScreenTop,Math.Min(Top,SystemParameters.VirtualScreenTop+SystemParameters.VirtualScreenHeight-Math.Max(ActualHeight,100))); }
    void LoadPosition() { try { if(File.Exists(settingsPath)) { var xy=File.ReadAllLines(settingsPath); double x,y; if(xy.Length>=2 && Double.TryParse(xy[0],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out x) && Double.TryParse(xy[1],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out y) && !Double.IsNaN(x) && !Double.IsNaN(y) && !Double.IsInfinity(x) && !Double.IsInfinity(y)) { Left=x;Top=y; } } } catch(IOException) {} }
    void SavePosition() { try { Directory.CreateDirectory(Path.GetDirectoryName(settingsPath)); File.WriteAllLines(settingsPath,new[]{Left.ToString(System.Globalization.CultureInfo.InvariantCulture),Top.ToString(System.Globalization.CultureInfo.InvariantCulture)}); } catch(IOException) {} }
}
