# Extracts REF-sheet inputs and results from FRAME 2015 workbooks for qa/validate.mjs.
# Usage: python3 -I extract_xlsx.py <folder with FRAME*.xlsx> cases.json
import sys, os, json, openpyxl
root=sys.argv[1]; out=[]
for dp,_,fs in os.walk(root):
    for f in sorted(fs):
        if not f.startswith('FRAME') or not f.endswith('.xlsx'): continue
        path=os.path.join(dp,f)
        try: wb=openpyxl.load_workbook(path,data_only=True)
        except Exception as e: out.append({'file':f,'err':str(e)}); continue
        P,A,D,S=wb['P - REF'],wb['A - REF'],wb['D - REF'],wb['FRAME2015']
        g=lambda ws,c: ws[c].value
        rec={'file':os.path.relpath(path,root),
         'in':{
          'Qi':g(P,'G7'),'Qm':g(P,'G8'),'T':g(P,'G11'),'m':g(P,'G12'),'M':g(P,'G13'),
          'l':g(P,'G16'),'A':g(P,'G17'),'b':g(P,'G18'),'access':g(P,'E19'),'h_raw':g(P,'F23'),
          'win':g(P,'F25'),'vents':g(P,'F26'),'flow':g(P,'F27'),'k_est':g(P,'F29'),'E':g(P,'F32'),'Z':g(P,'F35'),'H':g(P,'F36'),
          'a':[g(A,'G%d'%r) for r in range(7,18)],
          'X':g(A,'G22'),'x':g(A,'E23'),'O':g(A,'E24'),'p0':g(A,'G26'),'p_perc':g(A,'G27'),'p_plan':g(A,'G28'),'p_panic':g(A,'G29'),'rset':g(A,'E33'),
          'c1':g(A,'G36'),'val':g(A,'E37'),'defl_now':g(A,'E38'),'defl_2000':g(A,'E39'),'xr':g(A,'E40'),'d':g(A,'G49'),
          'w1':g(D,'G7'),'store':g(D,'E8'),'flowcap':g(D,'F12'),'looped':g(D,'D13'),'c70':g(D,'E16'),'c80':g(D,'E17'),'c110':g(D,'E18'),'bar':g(D,'E23'),
          'n1':[g(D,'E27'),g(D,'E28'),g(D,'E29'),g(D,'E30')],'n2':g(D,'G31'),'n3':g(D,'G32'),'n4':g(D,'G33'),'n5':g(D,'G34'),
          's_trans':g(D,'E38'),'s_ad':g(D,'E39'),'s_fault':g(D,'E40'),'s_zone':g(D,'E41'),'s2':g(D,'E42'),'s3':g(D,'E43'),'s4':g(D,'E44'),
          's5':g(D,'G45'),'s6':g(D,'G46'),'s7':g(D,'G47'),'s8':g(D,'G48'),'s9':g(D,'G49'),
          'fs':g(D,'E53'),'fo':g(D,'E54'),'fc':g(D,'E55'),'fi':g(D,'E56'),
          'u_partial':g(D,'E65'),'u_300':g(D,'E66'),'u_voice':g(D,'E67'),'u2':g(D,'G68'),'u_st':g(D,'G69'),'u_he':g(D,'G70'),'u_sign':g(D,'E71'),'u4':g(D,'G72'),'u_vent':g(D,'E74'),
          'y_det':g(D,'E82'),'y_spr':g(D,'E83'),'y_oth':g(D,'E84'),'y_fin':g(D,'E86'),'y_spare':g(D,'E87'),'y_rep':g(D,'E88'),'y_reloc':g(D,'E89'),'y_coop':g(D,'E90'),'y_prod':g(D,'E91'),
         },
         'labels':{k:g(ws,c) for k,ws,c in [('Qi',P,'D7'),('Qm',P,'D8'),('T',P,'D11'),('M',P,'D13'),('a1',A,'D7'),('a2',A,'D8'),('a3',A,'D9'),('a4',A,'D10'),('a5',A,'D11'),('a6',A,'D12'),('p',A,'D26'),('c1',A,'D36'),('d',A,'D49'),('w1',D,'D7'),('dia',D,'D12'),('n4',D,'D33'),('ad',D,'D39'),('s5',D,'D45'),('s6',D,'D46'),('s8',D,'D48'),('u3',D,'D69'),('he',D,'D70'),('u4',D,'D72'),('proj',S,'C4'),('comp',S,'B10')]},
         'out':{'P':g(P,'F41'),'P1':g(P,'F42'),'P2':g(P,'F43'),'A':g(A,'F53'),'A1':g(A,'F54'),'A2':g(A,'F55'),
                'D':g(D,'F96'),'D1':g(D,'F97'),'D2':g(D,'F98'),'R':g(S,'D28'),'R1':g(S,'D29'),'R2':g(S,'D30'),'Fo':g(S,'D43'),'Ro':g(S,'D47'),
                'q':g(P,'G9'),'i':g(P,'G14'),'g':g(P,'G20'),'v':g(P,'G30'),'e':g(P,'G33'),'z':g(P,'G38'),'t':g(A,'G34'),'tu':g(A,'E32'),'c':g(A,'G43'),'r':g(A,'G47'),
                'W':g(D,'G25'),'N':g(D,'G36'),'S':g(D,'G51'),'F':g(D,'G59'),'U':g(D,'G78'),'Y':g(D,'G93'),
                'V1':[g(S,'E28'),g(S,'E29'),g(S,'E30')],'V2':[g(S,'F28'),g(S,'F29'),g(S,'F30')],'nameV1':g(S,'B21'),'nameV2':g(S,'B24')}}
        out.append(rec)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=1,default=str)
print(len(out),'files')
