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
using System.Windows.Media.Imaging;
using System.Diagnostics;
using System.Windows.Threading;

public sealed class Overlay : Window
{
    static readonly StreamReader Input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
    static readonly StreamWriter Output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly StackPanel cards = new StackPanel();
    readonly TextBlock heading;
    readonly TextBlock subtitle;
    readonly TextBlock emblem;
    readonly Border emblemPlate;
    readonly Grid bubbleWrap;
    readonly System.Windows.Shapes.Path bubbleTail;
    readonly List<Button> headerButtons = new List<Button>();
    readonly Dictionary<string,Dictionary<string,string>> themes = new JavaScriptSerializer().Deserialize<Dictionary<string,Dictionary<string,string>>>(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"assets","bubble-themes.json")));
    Dictionary<string,string> theme;
    readonly Border orb;
    readonly Image sprite = new Image { Stretch = Stretch.Fill };
    readonly Button characterButton = new Button { Focusable = false };
    readonly DispatcherTimer animationClock = new DispatcherTimer();
    readonly Stopwatch animationTime = Stopwatch.StartNew();
    Dictionary<string,object> companion = new Dictionary<string,object>();
    Dictionary<string,object> pendingCompanion;
    string spriteId = "";
    int spriteRow = -1, spriteFrame = -1;
    double[] durations = new double[] {1680,660,660,840,840,1920};
    BitmapSource[] frames = new BitmapSource[0];
    readonly Border bubble;
    readonly Button expand;
    readonly ScrollViewer taskScroll;
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
        Width = 350; SizeToContent = SizeToContent.Height; MaxHeight = Math.Max(320,SystemParameters.WorkArea.Height-16);
        WindowStyle = WindowStyle.None; AllowsTransparency = true; Background = Brushes.Transparent;
        Topmost = true; ShowInTaskbar = false; ShowActivated = false; ResizeMode = ResizeMode.NoResize;
        FontFamily = new FontFamily("Microsoft YaHei UI");
        theme=themes["deepseek"];
        Left = SystemParameters.WorkArea.Right - Width - 28; Top = SystemParameters.WorkArea.Bottom - 260;
        LoadPosition();
        var root = new StackPanel { Margin = new Thickness(8), Background = null };
        bubbleWrap = new Grid {Width=320,HorizontalAlignment=HorizontalAlignment.Right};
        bubble = new Border { BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(22), Padding = new Thickness(15,13,15,12), Margin=new Thickness(0,0,0,12) };
        bubbleTail = new System.Windows.Shapes.Path {Data=Geometry.Parse("M0,0 C7,4 10,8 10,12 C16,11 22,6 24,0"),StrokeThickness=1,Width=24,Height=13,HorizontalAlignment=HorizontalAlignment.Right,VerticalAlignment=VerticalAlignment.Bottom,Margin=new Thickness(0,0,72,0)};
        var body = new StackPanel();
        var header = new DockPanel { Margin = new Thickness(0,0,0,13) };
        var close = FlatButton("×",14); close.Width=24;close.Height=24;close.ToolTip="关闭桌面窗口（不停止任务）";headerButtons.Add(close);
        DockPanel.SetDock(close,Dock.Right); close.Click += delegate { Close(); }; header.Children.Add(close);
        var collapse = FlatButton("−",14);collapse.Width=24;collapse.Height=24;collapse.ToolTip="收起气泡；右键角色可恢复";headerButtons.Add(collapse);
        DockPanel.SetDock(collapse,Dock.Right); collapse.Click += delegate { bubbleHidden=true; Emit(new {type="preferences",patch=new {bubbleHidden=true}}); Render(); }; header.Children.Add(collapse);
        emblem=Text("≈",23,"#596EC0");emblem.TextAlignment=TextAlignment.Center;emblem.Margin=new Thickness(0,-1,0,0);
        emblemPlate=new Border{Width=32,Height=32,CornerRadius=new CornerRadius(11),Margin=new Thickness(0,0,10,0),Child=emblem};
        DockPanel.SetDock(emblemPlate,Dock.Left);header.Children.Add(emblemPlate);
        var identity=new StackPanel();heading=Text("DeepSeek",12,"#34415F");heading.FontWeight=FontWeights.SemiBold;heading.Margin=new Thickness(0,0,0,2);
        subtitle=Text("全局任务",10,"#7A86A2");subtitle.Margin=new Thickness(0);
        identity.Children.Add(heading);identity.Children.Add(subtitle);header.Children.Add(identity);
        header.MouseLeftButtonDown += Drag;
        body.Children.Add(header);
        taskScroll = new ScrollViewer { Content = cards, MaxHeight = 420, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
        body.Children.Add(taskScroll);
        expand = FlatButton("",11);expand.HorizontalAlignment=HorizontalAlignment.Left;expand.Padding=new Thickness(0,5,0,0);
        expand.Click += delegate { expanded=!expanded; Render(); };
        body.Children.Add(expand); bubble.Child = body; bubbleWrap.Children.Add(bubble);bubbleWrap.Children.Add(bubbleTail);root.Children.Add(bubbleWrap);
        orb = new Border { Width = 192, Height = 208, Margin = new Thickness(0,-28,0,0), HorizontalAlignment = HorizontalAlignment.Right,
            Background = null, Cursor = Cursors.SizeAll, Child = sprite };
        orb.ToolTip = "拖动角色调整位置；右键打开角色与显示设置";
        orb.MouseLeftButtonDown += Drag;
        orb.MouseRightButtonUp += delegate { ShowMenu(); };
        characterButton.Content = "角色与显示设置 ⚙";
        characterButton.HorizontalAlignment = HorizontalAlignment.Right;
        characterButton.Width = 192; characterButton.Height = 26;
        characterButton.FontSize=10;characterButton.Template=ButtonTemplate();characterButton.BorderThickness = new Thickness(1);
        characterButton.Click += delegate { ShowMenu(); };
        root.Children.Add(orb); root.Children.Add(characterButton); Content = root;
        animationClock.Interval = TimeSpan.FromMilliseconds(33);
        animationClock.Tick += delegate { Animate(); }; animationClock.Start();
        SourceInitialized += delegate {
            handle = new WindowInteropHelper(this).Handle;
            SetWindowLong(handle,-20,GetWindowLong(handle,-20) | 0x08000080); // NOACTIVATE | TOOLWINDOW
            HwndSource.FromHwnd(handle).AddHook(WndProc);
        };
        Loaded += delegate { Clamp(); Emit(new {type="ready"}); StartReader(); };
        SizeChanged += delegate(object sender,SizeChangedEventArgs e) { if(e.PreviousSize.Height>0) Top+=e.PreviousSize.Height-e.NewSize.Height; Clamp(); };
        Closing += delegate { receiving=false; clock.Stop(); animationClock.Stop(); SavePosition(); };
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
                        object pet; pendingCompanion=message.TryGetValue("companion",out pet) ? pet as Dictionary<string,object> : null;
                        if (renderQueued) continue;
                        renderQueued=true;
                    }
                    Dispatcher.BeginInvoke(new Action(delegate {
                        lock(snapshotLock) { tasks=pendingTasks; companion=pendingCompanion ?? new Dictionary<string,object>(); bubbleHidden=Str(companion,"bubbleHidden")=="True"; renderQueued=false; }
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
        ConfigureCharacter();
        var active = tasks.Count(t => Active(Str(t,"state")));
        heading.Text=theme["name"];heading.Foreground=Color(T("ink"));
        subtitle.Text=tasks.Length==0 ? "陪你歇一会儿" : active>0 ? "全局任务 · "+active+" 项进行中" : "本轮结果";subtitle.Foreground=Color(T("muted"));
        emblem.Text=theme["symbol"];emblem.Foreground=Color(T("accent"));emblemPlate.Background=Color(T("soft"));
        foreach(var control in headerButtons)control.Foreground=Color(T("muted"));
        expand.Foreground=Color(T("accent"));
        bubble.Background=new LinearGradientBrush((System.Windows.Media.Color)ColorConverter.ConvertFromString(T("surface")),(System.Windows.Media.Color)ColorConverter.ConvertFromString(T("bottom")),90);
        bubble.BorderBrush=Color(T("border"));bubbleTail.Fill=Color(T("bottom"));bubbleTail.Stroke=Color(T("border"));
        bubbleWrap.Width=tasks.Length==0 ? 270 : 320;
        bubbleWrap.Visibility = !bubbleHidden && (tasks.Length>0 || Str(companion,"line")!="") ? Visibility.Visible : Visibility.Collapsed;
        orb.Margin=new Thickness(0,bubbleWrap.Visibility==Visibility.Visible ? -28 : 0,0,0);
        expand.Visibility = Visibility.Collapsed;
        if (tasks.Length > 0) {
            var roots = tasks.Where(t => String.IsNullOrEmpty(Str(t,"parentId")))
                .OrderBy(t => NeedsAttention(t) || HasWaitingChild(Str(t,"id"),new HashSet<string>()) ? 0 : Active(Str(t,"state")) ? 1 : 2).ToArray();
            foreach (var task in expanded ? roots : roots.Take(3)) {
                AddCard(task,false);
                if (expanded) AddChildren(Str(task,"id"),new HashSet<string>());
                else {
                    var children = DescendantCount(Str(task,"id"),new HashSet<string>());
                    if(children>0) cards.Children.Add(Text("↳ "+children+" 个子任务"+(HasWaitingChild(Str(task,"id"),new HashSet<string>()) ? " · 需要处理" : ""),10,T("muted")));
                }
            }
            if (roots.Length>3 || tasks.Any(t=>!String.IsNullOrEmpty(Str(t,"parentId")))) {
                expand.Visibility=Visibility.Visible;
                expand.Content=expanded ? "收起任务列表" : "展开全部 "+tasks.Length+" 个任务";
            }
        }
        if (Str(companion,"line")!="") {var line=Text(Str(companion,"line"),13,T("ink"));line.Margin=new Thickness(8,3,8,8);cards.Children.Add(line);}
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
            item.Key.Text=((int)duration.TotalMinutes).ToString("00")+":"+duration.Seconds.ToString("00");
        }
    }

    void AddChildren(string id, HashSet<string> seen)
    {
        if (!seen.Add(id)) return;
        foreach(var child in tasks.Where(t => Str(t,"parentId")==id)) { AddCard(child,true); AddChildren(Str(child,"id"),seen); }
    }

    void AddCard(Dictionary<string,object> task, bool child)
    {
        var panel = new StackPanel();
        var card=new Border{Background=Color("#C7FFFFFF"),BorderBrush=Color(T("border")),BorderThickness=new Thickness(0.6),CornerRadius=new CornerRadius(14),Padding=new Thickness(12,10,12,10),Margin=new Thickness(child ? 12 : 0,0,0,8),Child=panel};
        var name = FlatButton("",13);name.Content=new TextBlock{Text=(child ? "↳ " : "")+Str(task,"title")+" ↗",TextTrimming=TextTrimming.CharacterEllipsis,MaxWidth=child ? 238 : 250};
        name.FontWeight=FontWeights.SemiBold;name.Foreground=Color(T("ink"));name.HorizontalContentAlignment=HorizontalAlignment.Left;name.ToolTip="打开任务："+Str(task,"title");name.Margin=new Thickness(0,0,0,8);
        name.Click += delegate {
            Emit(new { type = "navigate", sessionId = Str(task,"id") });
            try { Process.Start(new ProcessStartInfo("dsh://open") { UseShellExecute = true }); }
            catch (Exception ex) { Console.Error.WriteLine("Open DSH: " + ex.Message); }
        };
        panel.Children.Add(name);
        var state = Str(task,"state");
        var color = state=="failed" ? "#AD5268" : (state=="approval" || state=="input") ? "#A27335" : T("accent");
        var statusRow=new DockPanel{Margin=new Thickness(0,0,0,6)};
        object start;
        if (Active(state) && task.TryGetValue("startedAt",out start) && start != null) {
            var label=Text("",10,T("muted"));label.FontFamily=new FontFamily("Consolas");label.VerticalAlignment=VerticalAlignment.Center;label.Margin=new Thickness(10,0,0,0);
            elapsed.Add(new KeyValuePair<TextBlock,double>(label,Convert.ToDouble(start)));DockPanel.SetDock(label,Dock.Right);statusRow.Children.Add(label);
        }
        var status=Text("• "+Str(task,"stage"),10,color);status.FontWeight=FontWeights.SemiBold;status.Margin=new Thickness(0);status.TextWrapping=TextWrapping.NoWrap;status.TextTrimming=TextTrimming.CharacterEllipsis;
        var statusBg=Color(color).Clone();statusBg.Opacity=0.09;
        statusRow.Children.Add(new Border{CornerRadius=new CornerRadius(7),Background=statusBg,Padding=new Thickness(7,3,7,3),HorizontalAlignment=HorizontalAlignment.Left,MaxWidth=180,Child=status});panel.Children.Add(statusRow);
        if (!String.IsNullOrEmpty(Str(task,"detail"))) {var detail=Text(Str(task,"detail"),12,T("muted"));detail.MaxHeight=36;detail.TextTrimming=TextTrimming.CharacterEllipsis;panel.Children.Add(detail);}
        cards.Children.Add(card);
    }

    void ConfigureCharacter()
    {
        var id=Str(companion,"id");
        if (id=="") return;
        var key=id.Split('-')[0];theme=themes.ContainsKey(key) ? themes[key] : themes["deepseek"];
        object value;
        double scale=companion.TryGetValue("scale",out value) ? Convert.ToDouble(value) : 1;
        orb.Width=192*scale; orb.Height=208*scale;characterButton.Width=Math.Min(144,orb.Width);characterButton.Margin=new Thickness(0,0,(orb.Width-characterButton.Width)/2,0);
        bubbleTail.Margin=new Thickness(0,0,orb.Width/2-24,0);
        taskScroll.MaxHeight=Math.Max(80,Math.Min(420,MaxHeight-orb.Height-120));
        characterButton.Content=theme["name"]+(id.EndsWith("chibi") ? " · Q 版" : "")+"  ⚙";
        characterButton.Foreground=Color(T("accent"));characterButton.Background=Color(T("surface"));characterButton.BorderBrush=Color(T("border"));
        var animation=companion.TryGetValue("animation",out value) ? value as Dictionary<string,object> : null;
        if(animation==null) return;
        var row=Convert.ToInt32(animation["row"]);
        durations=((IEnumerable)animation["durations"]).Cast<object>().Select(Convert.ToDouble).ToArray();
        if(id!=spriteId || row!=spriteRow) {
            if(row!=spriteRow) animationTime.Restart();
            spriteId=id; spriteRow=row; spriteFrame=-1;
            var bitmap=new BitmapImage(); bitmap.BeginInit(); bitmap.CacheOption=BitmapCacheOption.OnLoad;
            bitmap.UriSource=new Uri(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"assets","sprites",id+".png"));
            bitmap.EndInit(); bitmap.Freeze();
            frames=Enumerable.Range(0,durations.Length).Select(i => {
                var frame=new CroppedBitmap(bitmap,new Int32Rect(i*192,row*208,192,208)); frame.Freeze(); return (BitmapSource)frame;
            }).ToArray();
        }
        Animate();
    }
    void Animate()
    {
        if(frames.Length==0) return;
        double time=animationTime.Elapsed.TotalMilliseconds % durations.Sum(); int index=0;
        while(index<durations.Length-1 && time>=durations[index]) {time-=durations[index];index++;}
        if(index!=spriteFrame) {spriteFrame=index;sprite.Source=frames[index];}
    }
    MenuItem PreferenceItem(string title, object patch, bool selected)
    {
        var item=new MenuItem {Header=title,IsCheckable=true,IsChecked=selected};
        item.Click+=delegate {Emit(new {type="preferences",patch=patch});}; return item;
    }
    void ShowMenu()
    {
        var menu=new ContextMenu(); object raw;
        if(companion.TryGetValue("options",out raw)) foreach(var option in ((IEnumerable)raw).Cast<object>().OfType<Dictionary<string,object>>()) {
            var id=Str(option,"id"); menu.Items.Add(PreferenceItem(Str(option,"label"),new {id=id,mode="fixed"},id==Str(companion,"id")));
        }
        menu.Items.Add(new Separator());
        var modes=new[]{"fixed","sequential","favorites","random"}; var labels=new[]{"固定当前角色","顺序轮换","收藏轮换","随机轮换"};
        for(int i=0;i<modes.Length;i++) menu.Items.Add(PreferenceItem(labels[i],new {mode=modes[i]},Str(companion,"mode")==modes[i]));
        var favorites=companion.TryGetValue("favorites",out raw) ? ((IEnumerable)raw).Cast<object>().Select(Convert.ToString).ToList() : new List<string>();
        bool favorite=favorites.Contains(spriteId); if(favorite)favorites.Remove(spriteId);else favorites.Add(spriteId);
        menu.Items.Add(PreferenceItem(favorite ? "取消收藏当前形态" : "收藏当前形态",new {favorites=favorites.ToArray()},false));
        var interval=new MenuItem {Header="轮换间隔"};
        foreach(var seconds in new[]{5,10,30,60,300,900}) interval.Items.Add(PreferenceItem(seconds+" 秒",new {rotationSeconds=seconds},Str(companion,"rotationSeconds")==seconds.ToString()));
        menu.Items.Add(interval);
        var size=new MenuItem {Header="角色大小"};
        foreach(var scale in new[]{0.75,1.0,1.25,1.5}) size.Items.Add(PreferenceItem((int)(scale*100)+"%",new {scale=scale},companion.TryGetValue("scale",out raw) && Convert.ToDouble(raw)==scale));
        menu.Items.Add(size);menu.Items.Add(new Separator());
        var toggle=new MenuItem {Header=bubbleHidden ? "显示任务气泡" : "隐藏任务气泡"};toggle.Click+=delegate {bubbleHidden=!bubbleHidden;Emit(new {type="preferences",patch=new {bubbleHidden=bubbleHidden}});Render();};menu.Items.Add(toggle);
        var reset=new MenuItem {Header="恢复到主屏右下角"};reset.Click+=delegate {Left=SystemParameters.WorkArea.Right-Width-28;Top=SystemParameters.WorkArea.Bottom-ActualHeight-30;Clamp();SavePosition();};menu.Items.Add(reset);
        var close=new MenuItem {Header="关闭桌宠"};close.Click+=delegate {Close();};menu.Items.Add(close);
        menu.PlacementTarget=characterButton;menu.IsOpen=true;
    }

    static bool Active(string state) { return state=="running" || state=="approval" || state=="input"; }
    string T(string key) { return "#"+theme[key]; }
    static ControlTemplate ButtonTemplate()
    {
        var border=new FrameworkElementFactory(typeof(Border));border.SetValue(Border.CornerRadiusProperty,new CornerRadius(12));
        border.SetValue(Border.BackgroundProperty,new TemplateBindingExtension(Control.BackgroundProperty));border.SetValue(Border.BorderBrushProperty,new TemplateBindingExtension(Control.BorderBrushProperty));border.SetValue(Border.BorderThicknessProperty,new TemplateBindingExtension(Control.BorderThicknessProperty));border.SetValue(Border.PaddingProperty,new TemplateBindingExtension(Control.PaddingProperty));
        var content=new FrameworkElementFactory(typeof(ContentPresenter));content.SetValue(ContentPresenter.HorizontalAlignmentProperty,new TemplateBindingExtension(Control.HorizontalContentAlignmentProperty));content.SetValue(ContentPresenter.VerticalAlignmentProperty,VerticalAlignment.Center);border.AppendChild(content);
        var template=new ControlTemplate(typeof(Button)){VisualTree=border};var hover=new Trigger{Property=UIElement.IsMouseOverProperty,Value=true};hover.Setters.Add(new Setter(UIElement.OpacityProperty,0.72));template.Triggers.Add(hover);return template;
    }
    static Button FlatButton(string content,double size) {return new Button{Content=content,FontSize=size,Focusable=false,Background=Brushes.Transparent,BorderThickness=new Thickness(0),Template=ButtonTemplate(),Padding=new Thickness(0)};}
    static string Str(Dictionary<string,object> item, string key) { object value; return item.TryGetValue(key,out value) && value!=null ? Convert.ToString(value) : ""; }
    static Brush Color(string value) { return (Brush)new BrushConverter().ConvertFromString(value); }
    static TextBlock Text(string text, double size, string color) { return new TextBlock {Text=text,FontSize=size,Foreground=Color(color),Margin=new Thickness(0,2,0,2),TextWrapping=TextWrapping.Wrap}; }
    static void Emit(object message) { try { Output.WriteLine(new JavaScriptSerializer().Serialize(message)); } catch(IOException) {} }
    void Drag(object sender, MouseButtonEventArgs e) { if(e.ChangedButton==MouseButton.Left && e.LeftButton==MouseButtonState.Pressed) { DragMove(); Clamp(); SavePosition(); } }
    void Clamp() { Left=Math.Max(SystemParameters.VirtualScreenLeft,Math.Min(Left,SystemParameters.VirtualScreenLeft+SystemParameters.VirtualScreenWidth-Width)); Top=Math.Max(SystemParameters.VirtualScreenTop,Math.Min(Top,SystemParameters.VirtualScreenTop+SystemParameters.VirtualScreenHeight-Math.Max(ActualHeight,100))); }
    void LoadPosition() { try { if(File.Exists(settingsPath)) { var xy=File.ReadAllLines(settingsPath); double x,y; if(xy.Length>=2 && Double.TryParse(xy[0],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out x) && Double.TryParse(xy[1],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out y) && !Double.IsNaN(x) && !Double.IsNaN(y) && !Double.IsInfinity(x) && !Double.IsInfinity(y)) { Left=x;Top=y; } } } catch(IOException) {} }
    void SavePosition() { try { Directory.CreateDirectory(Path.GetDirectoryName(settingsPath)); File.WriteAllLines(settingsPath,new[]{Left.ToString(System.Globalization.CultureInfo.InvariantCulture),Top.ToString(System.Globalization.CultureInfo.InvariantCulture)}); } catch(IOException) {} }
}
